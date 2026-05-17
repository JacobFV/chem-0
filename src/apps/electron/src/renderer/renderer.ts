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
      openRecordWindow: () => Promise<JsonObject>;
      openTrainWindow: () => Promise<JsonObject>;
      openReplayWindow: () => Promise<JsonObject>;
      openSettingsWindow: () => Promise<JsonObject>;
      platform: string;
      onAgentEvent: (callback: (event: JsonObject) => void) => () => void;
    };
  }
}

document.body.classList.add(`platform-${window.chem0?.platform ?? "darwin"}`);

const output = document.querySelector<HTMLPreElement>("#output")!;
const experimentSelect = document.querySelector<HTMLSelectElement>("#experiment")!;
const experimentName = document.querySelector<HTMLInputElement>("#experiment-name")!;
const experimentsList = document.querySelector<HTMLUListElement>("#experiments-list")!;
const robotsList = document.querySelector<HTMLUListElement>("#robots-list")!;
const artifactsList = document.querySelector<HTMLUListElement>("#artifacts-list")!;
const experimentMeta = document.querySelector<HTMLPreElement>("#experiment-meta")!;
const experimentNotes = document.querySelector<HTMLTextAreaElement>("#experiment-notes")!;
const defaultRobotInput = document.querySelector<HTMLInputElement>("#default-robot")!;
const setDefaultRobot = document.querySelector<HTMLButtonElement>("#set-default-robot")!;
const refreshRobotsBtn = document.querySelector<HTMLButtonElement>("#refresh-robots")!;
const refreshArtifactsBtn = document.querySelector<HTMLButtonElement>("#refresh-artifacts")!;
const activeExperiment = document.querySelector<HTMLDivElement>("#active-experiment")!;
const activeExperimentText = activeExperiment.querySelector<HTMLSpanElement>(".status-text") ?? activeExperiment;
const chatLog = document.querySelector<HTMLDivElement>("#chat-log")!;
const chatInput = document.querySelector<HTMLTextAreaElement>("#chat-input")!;
const sendMessage = document.querySelector<HTMLButtonElement>("#send-message")!;
const recordAudio = document.querySelector<HTMLButtonElement>("#record-audio")!;
const stopAudio = document.querySelector<HTMLButtonElement>("#stop-audio")!;
const phCanvas = document.querySelector<HTMLCanvasElement>("#ph-canvas");
const workspace = document.querySelector<HTMLDivElement>(".workspace")!;
const lhsSidebar = document.querySelector<HTMLElement>("#sidebar-lhs")!;
const rhsSidebar = document.querySelector<HTMLElement>("#sidebar-rhs")!;
const toggleLhsBtn = document.querySelector<HTMLButtonElement>("#toggle-lhs")!;
const toggleRhsBtn = document.querySelector<HTMLButtonElement>("#toggle-rhs")!;
const openSettingsBtn = document.querySelector<HTMLButtonElement>("#open-settings")!;
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
let experimentsCache: JsonObject[] = [];

type PhSample = { value: number; timestamp: number };
const phSamples: PhSample[] = [];

function setActiveExperimentLabel(text: string, active: boolean): void {
  activeExperimentText.textContent = text;
  activeExperiment.classList.toggle("active", active);
}

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
  updateExperimentsListSelection();
  updateNotesPane();
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

function renderExperimentsList(): void {
  experimentsList.replaceChildren();
  if (experimentsCache.length === 0) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "No experiments yet. Create one above.";
    experimentsList.append(empty);
    return;
  }
  for (const experiment of experimentsCache) {
    const id = String(experiment.id);
    const li = document.createElement("li");
    li.className = "list-item";
    li.dataset.experimentId = id;
    if (id === experimentId) li.classList.add("active");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = String(experiment.name ?? "Untitled");
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = id;
    li.append(title, sub);
    li.addEventListener("click", () => {
      if (id === experimentId) return;
      setActive(experiment);
      void loadEvents();
      void refreshArtifacts();
    });
    experimentsList.append(li);
  }
}

function updateExperimentsListSelection(): void {
  for (const li of experimentsList.querySelectorAll<HTMLLIElement>(".list-item")) {
    li.classList.toggle("active", li.dataset.experimentId === experimentId);
  }
}

function updateNotesPane(): void {
  if (!experimentId) {
    experimentMeta.textContent = "No experiment selected";
    experimentNotes.value = "";
    experimentNotes.disabled = true;
    return;
  }
  const experiment = experimentsCache.find((e) => String(e.id) === experimentId);
  experimentMeta.textContent = experiment
    ? JSON.stringify(experiment, null, 2)
    : `id: ${experimentId}`;
  experimentNotes.disabled = false;
  experimentNotes.value = localStorage.getItem(`chem0:notes:${experimentId}`) ?? "";
}

experimentNotes.addEventListener("input", () => {
  if (!experimentId) return;
  localStorage.setItem(`chem0:notes:${experimentId}`, experimentNotes.value);
});

async function refreshExperiments(): Promise<void> {
  const result = await window.chem0.listExperiments();
  const experiments = (result.experiments ?? []) as JsonObject[];
  experimentsCache = experiments;
  experimentSelect.replaceChildren();
  for (const experiment of experiments) {
    const option = document.createElement("option");
    option.value = String(experiment.id);
    option.textContent = `${String(experiment.name)} · ${String(experiment.id)}`;
    experimentSelect.append(option);
  }
  if (!experimentId && experiments[0]) setActive(experiments[0]);
  if (experimentId) experimentSelect.value = experimentId;
  renderExperimentsList();
  updateNotesPane();
}

async function refreshArtifacts(): Promise<void> {
  artifactsList.replaceChildren();
  if (!experimentId) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "Select an experiment to see its artifacts.";
    artifactsList.append(empty);
    return;
  }
  try {
    const result = await window.chem0.listArtifacts(experimentId);
    const artifacts = (result.artifacts ?? []) as JsonObject[];
    if (artifacts.length === 0) {
      const empty = document.createElement("li");
      empty.className = "list-empty";
      empty.textContent = "No artifacts for this experiment yet.";
      artifactsList.append(empty);
      return;
    }
    for (const artifact of artifacts) {
      const li = document.createElement("li");
      li.className = "list-item";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = String(artifact.name ?? artifact.id ?? "artifact");
      const sub = document.createElement("div");
      sub.className = "sub";
      const kind = artifact.kind ?? artifact.mime_type ?? "";
      const size = artifact.size_bytes ?? artifact.size ?? "";
      sub.textContent = [kind, size].filter(Boolean).join(" · ") || String(artifact.id ?? "");
      li.append(title, sub);
      artifactsList.append(li);
    }
  } catch (error) {
    const li = document.createElement("li");
    li.className = "list-empty";
    li.textContent = `Failed to load artifacts: ${error instanceof Error ? error.message : String(error)}`;
    artifactsList.append(li);
  }
}

function textFromTool(result: JsonObject): string {
  const content = result.content;
  if (!Array.isArray(content)) return JSON.stringify(result);
  const first = content[0] as JsonObject | undefined;
  return typeof first?.text === "string" ? (first.text as string) : JSON.stringify(result);
}

async function refreshRobots(): Promise<void> {
  robotsList.replaceChildren();
  try {
    const result = await window.chem0.callTool("list_connected_robots", { max_id: 12 });
    let parsed: JsonObject = {};
    try { parsed = JSON.parse(textFromTool(result)) as JsonObject; } catch { parsed = result; }
    const robots = (parsed.robots ?? []) as JsonObject[];
    if (!Array.isArray(robots) || robots.length === 0) {
      const empty = document.createElement("li");
      empty.className = "list-empty";
      empty.textContent = "No arms detected. Plug one in and refresh.";
      robotsList.append(empty);
      return;
    }
    for (const robot of robots) {
      const li = document.createElement("li");
      li.className = "list-item";
      const robotId = String(robot.suggested_robot_id ?? robot.robot_id ?? "so101");
      if (robotId === defaultRobotId) li.classList.add("active");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = robotId;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = `${String(robot.port ?? "?")} · ${robot.looks_like_so101 ? "so101" : "unknown"}`;
      li.append(title, sub);
      li.addEventListener("click", () => {
        defaultRobotInput.value = robotId;
        void applyDefaultRobot(robotId);
      });
      robotsList.append(li);
    }
  } catch (error) {
    const li = document.createElement("li");
    li.className = "list-empty";
    li.textContent = `Failed to scan: ${error instanceof Error ? error.message : String(error)}`;
    robotsList.append(li);
  }
}

async function applyDefaultRobot(robotId: string): Promise<void> {
  const result = await window.chem0.callTool("set_default_robot", { robot_id: robotId });
  defaultRobotId = String(result.robot_id ?? robotId);
  defaultRobotInput.value = defaultRobotId;
  show(result);
  void refreshRobots();
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

/* ------------------------- tabs & sidebars ------------------------- */

const SIDEBAR_TABS: Record<"lhs" | "rhs", string> = {
  lhs: "lhs:experiments",
  rhs: "rhs:chat"
};

function activateTab(tab: string): void {
  const [side] = tab.split(":") as ["lhs" | "rhs"];
  if (side !== "lhs" && side !== "rhs") return;
  SIDEBAR_TABS[side] = tab;
  const sidebar = side === "lhs" ? lhsSidebar : rhsSidebar;
  for (const pane of sidebar.querySelectorAll<HTMLElement>(".sidebar-pane")) {
    pane.classList.toggle("active", pane.dataset.tab === tab);
  }
  for (const btn of document.querySelectorAll<HTMLButtonElement>(`.tab-btn[data-tab^="${side}:"]`)) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
  if (!workspace.classList.contains(`${side}-collapsed`)) return;
  workspace.classList.remove(`${side}-collapsed`);
  updateToggleButtonStates();
}

function updateToggleButtonStates(): void {
  toggleLhsBtn.classList.toggle("active", !workspace.classList.contains("lhs-collapsed"));
  toggleRhsBtn.classList.toggle("active", !workspace.classList.contains("rhs-collapsed"));
}

toggleLhsBtn.addEventListener("click", () => {
  workspace.classList.toggle("lhs-collapsed");
  updateToggleButtonStates();
  drawPhChart();
});
toggleRhsBtn.addEventListener("click", () => {
  workspace.classList.toggle("rhs-collapsed");
  updateToggleButtonStates();
  drawPhChart();
});

for (const btn of document.querySelectorAll<HTMLButtonElement>(".tab-btn")) {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab) activateTab(tab);
  });
}

activateTab(SIDEBAR_TABS.lhs);
activateTab(SIDEBAR_TABS.rhs);
updateToggleButtonStates();

/* --------------------------- boot & actions --------------------------- */

async function boot(): Promise<void> {
  const [tools] = await Promise.all([window.chem0.listTools(), refreshExperiments()]);
  const defaultRobot = await window.chem0.callTool("get_default_robot", {});
  defaultRobotId = typeof defaultRobot.robot_id === "string" ? defaultRobot.robot_id : "";
  defaultRobotInput.value = defaultRobotId;
  show(tools);
  await loadEvents();
  void refreshArtifacts();
  void refreshRobots();
  void initBrowserCameras();
  setInterval(() => void refreshRobots(), 8000);
}

document.querySelector("#create-experiment")?.addEventListener("click", async () => {
  try {
    const result = await window.chem0.createExperiment(experimentName.value.trim() || "Untitled experiment", { app: "electron" });
    show(result);
    setActive(result.experiment as JsonObject, result.session as JsonObject);
    await refreshExperiments();
    await loadEvents();
    void refreshArtifacts();
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
  updateExperimentsListSelection();
  updateNotesPane();
  await loadEvents();
  void refreshArtifacts();
});

refreshRobotsBtn.addEventListener("click", () => void refreshRobots());
refreshArtifactsBtn.addEventListener("click", () => void refreshArtifacts());

document.querySelector("#pose-table")?.addEventListener("click", async () => show(await window.chem0.readResource("lerobot://pose-table")));
document.querySelector("#open-record")?.addEventListener("click", async () => show(await window.chem0.openRecordWindow()));
document.querySelector("#open-train")?.addEventListener("click", async () => show(await window.chem0.openTrainWindow()));
document.querySelector("#open-replay")?.addEventListener("click", async () => show(await window.chem0.openReplayWindow()));
document.querySelector("#open-calibration")?.addEventListener("click", async () => show(await window.chem0.openCalibrationWindow()));
openSettingsBtn.addEventListener("click", async () => show(await window.chem0.openSettingsWindow()));
setDefaultRobot.addEventListener("click", async () => {
  const robotId = defaultRobotInput.value.trim();
  if (!robotId) {
    show("Enter a robot_id first.");
    return;
  }
  await applyDefaultRobot(robotId);
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
