type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export {};

declare global {
  interface Window {
    chem0: {
      listTools: () => Promise<JsonObject>;
      readResource: (uri: string) => Promise<JsonObject>;
      readUrdf: () => Promise<JsonObject>;
      callTool: (name: string, args?: JsonObject) => Promise<JsonObject>;
      createExperiment: (name: string, metadata?: JsonObject) => Promise<JsonObject>;
      listExperiments: () => Promise<JsonObject>;
      listEvents: (experimentId: string) => Promise<JsonObject>;
      listArtifacts: (experimentId: string) => Promise<JsonObject>;
      sendAgentMessage: (input: JsonObject) => Promise<JsonObject>;
      openCalibrationWindow: () => Promise<JsonObject>;
      onAgentEvent: (callback: (event: JsonObject) => void) => () => void;
    };
  }
}

const output = document.querySelector<HTMLPreElement>("#output")!;
const experimentSelect = document.querySelector<HTMLSelectElement>("#experiment")!;
const experimentName = document.querySelector<HTMLInputElement>("#experiment-name")!;
const defaultRobotInput = document.querySelector<HTMLInputElement>("#default-robot")!;
const setDefaultRobot = document.querySelector<HTMLButtonElement>("#set-default-robot")!;
const activeExperiment = document.querySelector<HTMLDivElement>("#active-experiment")!;
const activeExperimentText = activeExperiment.querySelector<HTMLSpanElement>(".status-text") ?? activeExperiment;
function setActiveExperimentLabel(text: string, active: boolean): void {
  activeExperimentText.textContent = text;
  activeExperiment.classList.toggle("active", active);
}
const chatLog = document.querySelector<HTMLDivElement>("#chat-log")!;
const chatInput = document.querySelector<HTMLTextAreaElement>("#chat-input")!;
const sendMessage = document.querySelector<HTMLButtonElement>("#send-message")!;
const recordAudio = document.querySelector<HTMLButtonElement>("#record-audio")!;
const stopAudio = document.querySelector<HTMLButtonElement>("#stop-audio")!;
const phCanvas = document.querySelector<HTMLCanvasElement>("#ph-canvas");
const camVideos: (HTMLVideoElement | null)[] = [
  document.querySelector<HTMLVideoElement>("#cam-0"),
  document.querySelector<HTMLVideoElement>("#cam-1"),
  document.querySelector<HTMLVideoElement>("#cam-2"),
];
const camStreams: (MediaStream | null)[] = [null, null, null];

let experimentId = "";
let sessionId = "";
let defaultRobotId = "";
let assistantBubble: HTMLDivElement | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];

type PhSample = { value: number; timestamp: number };
const phSamples: PhSample[] = [];

function show(value: unknown): void {
  output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function withExperiment(args: JsonObject = {}): JsonObject {
  const next: JsonObject = { ...args };
  if (experimentId) next.experiment_id = experimentId;
  if (defaultRobotId && !next.robot_id) next.robot_id = defaultRobotId;
  return next;
}

function setActive(experiment: JsonObject, session?: JsonObject): void {
  experimentId = String(experiment.id ?? "");
  sessionId = String(session?.id ?? sessionId);
  setActiveExperimentLabel(
    experimentId ? `${String(experiment.name ?? "Experiment")} · ${experimentId}` : "No experiment",
    Boolean(experimentId)
  );
}

function appendChat(role: string, text: string): HTMLDivElement {
  const item = document.createElement("div");
  item.className = `chat-item ${role}`;
  const label = document.createElement("div");
  label.className = "chat-role";
  label.textContent = role;
  const body = document.createElement("div");
  body.className = "chat-body";
  body.textContent = text;
  item.append(label, body);
  chatLog.append(item);
  chatLog.scrollTop = chatLog.scrollHeight;
  return body;
}

function imagesFromContent(content: unknown): Array<{ data: string; mimeType: string }> {
  if (!Array.isArray(content)) return [];
  const images: Array<{ data: string; mimeType: string }> = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const c = item as JsonObject;
    if (c.type === "image" && typeof c.data === "string" && typeof c.mimeType === "string") {
      images.push({ data: c.data, mimeType: c.mimeType });
    }
  }
  return images;
}

function appendToolBubble(name: string, result: JsonObject | undefined): void {
  const body = appendChat("tool", `${name} response`);
  if (!result) return;
  for (const img of imagesFromContent(result.content)) {
    const el = document.createElement("img");
    el.src = `data:${img.mimeType};base64,${img.data}`;
    el.className = "tool-image";
    body.parentElement?.appendChild(el);
  }
}

function drawPhChart(): void {
  if (!phCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = phCanvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  phCanvas.width = Math.floor(rect.width * dpr);
  phCanvas.height = Math.floor(rect.height * dpr);
  const ctx = phCanvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const padLeft = 32;
  const padBottom = 18;
  const padTop = 10;
  const padRight = 12;
  const innerW = Math.max(1, w - padLeft - padRight);
  const innerH = Math.max(1, h - padTop - padBottom);

  ctx.font = "11px Inter, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";

  for (const ph of [0, 7, 14]) {
    const y = padTop + innerH - (ph / 14) * innerH;
    ctx.strokeStyle = "#1c2029";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + innerW, y);
    ctx.stroke();
    ctx.fillStyle = "#7a8290";
    ctx.fillText(String(ph), padLeft - 6, y);
  }

  ctx.strokeStyle = "#262c37";
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, padTop + innerH);
  ctx.lineTo(padLeft + innerW, padTop + innerH);
  ctx.stroke();

  if (phSamples.length === 0) {
    ctx.fillStyle = "#444";
    ctx.textAlign = "center";
    ctx.fillText("waiting for record_ph samples…", padLeft + innerW / 2, padTop + innerH / 2);
    return;
  }

  const tMin = phSamples[0].timestamp;
  const tMax = phSamples[phSamples.length - 1].timestamp;
  const tSpan = Math.max(1, tMax - tMin);

  const xFor = (t: number) =>
    phSamples.length === 1 ? padLeft + innerW / 2 : padLeft + ((t - tMin) / tSpan) * innerW;
  const yFor = (v: number) => padTop + innerH - (Math.max(0, Math.min(14, v)) / 14) * innerH;

  ctx.strokeStyle = "#6ee7c8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  phSamples.forEach((sample, i) => {
    const x = xFor(sample.timestamp);
    const y = yFor(sample.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#6ee7c8";
  for (const sample of phSamples) {
    const x = xFor(sample.timestamp);
    const y = yFor(sample.value);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderEvents(events: JsonObject[]): void {
  chatLog.replaceChildren();
  phSamples.length = 0;
  for (const event of events) {
    const type = String(event.type ?? "");
    const role = String(event.role ?? "system");
    const content = (event.content ?? {}) as JsonObject;
    if (type === "message" && role !== "system") appendChat(role, String(content.text ?? ""));
    if (type === "tool_call") appendChat("tool", `${String(event.name ?? "tool")} ${JSON.stringify(content)}`);
    if (type === "tool_response") appendToolBubble(String(event.name ?? "tool"), content);
    if (type === "error") appendChat("error", String(content.message ?? content.text ?? ""));
    if (type === "ph_sample") {
      const v = Number(content.value);
      const t = Number(content.timestamp);
      if (Number.isFinite(v) && Number.isFinite(t)) phSamples.push({ value: v, timestamp: t });
    }
  }
  drawPhChart();
}

async function refreshExperiments(): Promise<void> {
  const result = await window.chem0.listExperiments();
  const experiments = (result.experiments ?? []) as JsonObject[];
  experimentSelect.replaceChildren();
  for (const experiment of experiments) {
    const option = document.createElement("option");
    option.value = String(experiment.id);
    option.textContent = `${String(experiment.name)} · ${String(experiment.id)}`;
    experimentSelect.append(option);
  }
  if (!experimentId && experiments[0]) setActive(experiments[0]);
  if (experimentId) experimentSelect.value = experimentId;
}

async function loadEvents(): Promise<void> {
  if (!experimentId) {
    phSamples.length = 0;
    drawPhChart();
    return;
  }
  const result = await window.chem0.listEvents(experimentId);
  renderEvents((result.events ?? []) as JsonObject[]);
  show(result);
}

async function call(name: string, args: JsonObject = {}): Promise<JsonObject> {
  const result = await window.chem0.callTool(name, withExperiment(args));
  show(result);
  return result;
}

function updateCameraVisibility(activeIds: Set<number>): void {
  for (let i = 0; i < camVideos.length; i++) {
    const cell = camVideos[i]?.closest(".camera-cell") as HTMLElement | null;
    if (!cell) continue;
    cell.classList.toggle("hidden", !activeIds.has(i));
  }
}

function setCameraLabel(slot: number, label: string): void {
  const cell = camVideos[slot]?.closest(".camera-cell") as HTMLElement | null;
  const labelEl = cell?.querySelector(".camera-label") as HTMLElement | null;
  if (labelEl) labelEl.textContent = label;
}

function isLikelyContinuityCamera(label: string): boolean {
  const lower = label.toLowerCase();
  return lower.includes("iphone") || lower.includes("ipad") || lower.includes("continuity");
}

async function initBrowserCameras(): Promise<void> {
  const active = new Set<number>();
  try {
    // Trigger permission once so device labels populate
    const probeStream = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of probeStream.getTracks()) track.stop();

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices
      .filter((d) => d.kind === "videoinput")
      .filter((d) => !isLikelyContinuityCamera(d.label));

    for (let i = 0; i < camVideos.length; i++) {
      const video = camVideos[i];
      const device = videoDevices[i];
      if (!video || !device) continue;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: device.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });
        video.srcObject = stream;
        camStreams[i] = stream;
        setCameraLabel(i, device.label ? device.label.slice(0, 28) : `cam ${i}`);
        active.add(i);
      } catch (error) {
        console.error(`Failed to open camera slot ${i}`, error);
      }
    }
  } catch (error) {
    console.error("Camera permission denied or unavailable", error);
  }
  updateCameraVisibility(active);
}

window.addEventListener("beforeunload", () => {
  for (const stream of camStreams) {
    if (!stream) continue;
    for (const track of stream.getTracks()) track.stop();
  }
});

async function boot(): Promise<void> {
  const [tools] = await Promise.all([window.chem0.listTools(), refreshExperiments()]);
  const defaultRobot = await window.chem0.callTool("get_default_robot", {});
  defaultRobotId = typeof defaultRobot.robot_id === "string" ? defaultRobot.robot_id : "";
  defaultRobotInput.value = defaultRobotId;
  show(tools);
  await loadEvents();
  void initBrowserCameras();
}

document.querySelector("#create-experiment")?.addEventListener("click", async () => {
  try {
    const result = await window.chem0.createExperiment(experimentName.value.trim() || "Untitled experiment", { app: "electron" });
    show(result);
    setActive(result.experiment as JsonObject, result.session as JsonObject);
    await refreshExperiments();
    await loadEvents();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    show({ create_experiment_error: message });
    appendChat("error", `create_experiment failed: ${message}`);
  }
});

experimentSelect.addEventListener("change", async () => {
  experimentId = experimentSelect.value;
  sessionId = "";
  setActiveExperimentLabel(experimentId || "No experiment", Boolean(experimentId));
  await loadEvents();
});

document.querySelector("#list-tools")?.addEventListener("click", () => void boot());
document.querySelector("#pose-table")?.addEventListener("click", async () => show(await window.chem0.readResource("lerobot://pose-table")));
document.querySelector("#open-calibration")?.addEventListener("click", async () => show(await window.chem0.openCalibrationWindow()));
setDefaultRobot.addEventListener("click", async () => {
  const robotId = defaultRobotInput.value.trim();
  if (!robotId) {
    show("Enter a robot_id first.");
    return;
  }
  const result = await window.chem0.callTool("set_default_robot", { robot_id: robotId });
  defaultRobotId = String(result.robot_id ?? robotId);
  defaultRobotInput.value = defaultRobotId;
  show(result);
});

sendMessage.addEventListener("click", async () => {
  await sendToAgent(chatInput.value);
});

async function sendToAgent(raw: string): Promise<void> {
  const message = raw.trim();
  if (!message || !experimentId) return;
  chatInput.value = "";
  assistantBubble = null;
  const payload: JsonObject = {
    experiment_id: experimentId,
    message,
    model: "gpt-5.5"
  };
  if (sessionId) payload.session_id = sessionId;
  await window.chem0.sendAgentMessage(payload);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

recordAudio.addEventListener("click", async () => {
  if (!experimentId) {
    show("Create or select an experiment before recording audio.");
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", () => {
    for (const track of stream.getTracks()) track.stop();
  });
  mediaRecorder.start();
  recordAudio.disabled = true;
  stopAudio.disabled = false;
  appendChat("system", "Recording human audio...");
});

stopAudio.addEventListener("click", async () => {
  if (!mediaRecorder) return;
  const stopped = new Promise<void>((resolve) => mediaRecorder?.addEventListener("stop", () => resolve(), { once: true }));
  mediaRecorder.stop();
  await stopped;
  recordAudio.disabled = false;
  stopAudio.disabled = true;
  const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
  mediaRecorder = null;
  const result = await call("listen_to_human", {
    audio_base64: await blobToBase64(blob),
    mime_type: blob.type || "audio/webm"
  });
  const text = typeof result.text === "string" ? result.text.trim() : "";
  if (text) await sendToAgent(text);
});

window.chem0.onAgentEvent((event) => {
  if (event.experiment_id !== experimentId) return;
  if (event.session_id && !sessionId) sessionId = String(event.session_id);
  if (event.type === "message") appendChat(String(event.role ?? "user"), String(event.text ?? ""));
  if (event.type === "assistant_delta") {
    if (!assistantBubble) assistantBubble = appendChat("assistant", "");
    assistantBubble.textContent += String(event.text ?? "");
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  if (event.type === "tool_response") {
    appendToolBubble(String(event.name ?? "tool"), event.result as JsonObject | undefined);
    assistantBubble = null;
  }
  if (event.type === "ph_sample") {
    const v = Number(event.value);
    const t = Number(event.timestamp);
    if (Number.isFinite(v) && Number.isFinite(t)) {
      phSamples.push({ value: v, timestamp: t });
      drawPhChart();
    }
  }
  if (event.type === "error") appendChat("error", String(event.message ?? ""));
});

window.addEventListener("resize", () => drawPhChart());

void boot();
