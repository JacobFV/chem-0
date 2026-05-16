type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export {};

declare global {
  interface Window {
    chem0: {
      listTools: () => Promise<JsonObject>;
      readResource: (uri: string) => Promise<JsonObject>;
      callTool: (name: string, args?: JsonObject) => Promise<JsonObject>;
      createExperiment: (name: string, metadata?: JsonObject) => Promise<JsonObject>;
      listExperiments: () => Promise<JsonObject>;
      listEvents: (experimentId: string) => Promise<JsonObject>;
      listArtifacts: (experimentId: string) => Promise<JsonObject>;
      sendAgentMessage: (input: JsonObject) => Promise<JsonObject>;
      onAgentEvent: (callback: (event: JsonObject) => void) => () => void;
    };
  }
}

const output = document.querySelector<HTMLPreElement>("#output")!;
const toolSelect = document.querySelector<HTMLSelectElement>("#tool")!;
const argsInput = document.querySelector<HTMLTextAreaElement>("#args")!;
const cameraFrame = document.querySelector<HTMLImageElement>("#camera-frame")!;
const experimentSelect = document.querySelector<HTMLSelectElement>("#experiment")!;
const experimentName = document.querySelector<HTMLInputElement>("#experiment-name")!;
const activeExperiment = document.querySelector<HTMLDivElement>("#active-experiment")!;
const chatLog = document.querySelector<HTMLDivElement>("#chat-log")!;
const chatInput = document.querySelector<HTMLTextAreaElement>("#chat-input")!;
const sendMessage = document.querySelector<HTMLButtonElement>("#send-message")!;

let experimentId = "";
let sessionId = "";
let assistantBubble: HTMLDivElement | null = null;

function show(value: unknown): void {
  output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function parseArgs(): JsonObject {
  const raw = argsInput.value.trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as JsonObject;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Arguments must be a JSON object.");
  return parsed;
}

function withExperiment(args: JsonObject = {}): JsonObject {
  return experimentId ? { ...args, experiment_id: experimentId } : args;
}

function setActive(experiment: JsonObject, session?: JsonObject): void {
  experimentId = String(experiment.id ?? "");
  sessionId = String(session?.id ?? sessionId);
  activeExperiment.textContent = experimentId ? `${String(experiment.name ?? "Experiment")} · ${experimentId}` : "No experiment";
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

function renderEvents(events: JsonObject[]): void {
  chatLog.replaceChildren();
  for (const event of events) {
    const type = String(event.type ?? "");
    const role = String(event.role ?? "system");
    const content = (event.content ?? {}) as JsonObject;
    if (type === "message" && role !== "system") appendChat(role, String(content.text ?? ""));
    if (type === "tool_call") appendChat("tool", `${String(event.name ?? "tool")} ${JSON.stringify(content)}`);
    if (type === "tool_response") appendChat("tool", `${String(event.name ?? "tool")} response`);
    if (type === "error") appendChat("error", String(content.message ?? content.text ?? ""));
  }
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
  if (!experimentId) return;
  const result = await window.chem0.listEvents(experimentId);
  renderEvents((result.events ?? []) as JsonObject[]);
  show(result);
}

async function call(name: string, args: JsonObject = {}): Promise<JsonObject> {
  const result = await window.chem0.callTool(name, withExperiment(args));
  show(result);
  return result;
}

async function boot(): Promise<void> {
  const [tools] = await Promise.all([window.chem0.listTools(), refreshExperiments()]);
  toolSelect.replaceChildren();
  for (const tool of (tools.tools ?? []) as Array<{ name: string }>) {
    const option = document.createElement("option");
    option.value = tool.name;
    option.textContent = tool.name;
    toolSelect.append(option);
  }
  show(tools);
  await loadEvents();
}

document.querySelector("#create-experiment")?.addEventListener("click", async () => {
  const result = await window.chem0.createExperiment(experimentName.value.trim() || "Untitled experiment", { app: "electron" });
  setActive(result.experiment as JsonObject, result.session as JsonObject);
  await refreshExperiments();
  await loadEvents();
});

experimentSelect.addEventListener("change", async () => {
  experimentId = experimentSelect.value;
  sessionId = "";
  activeExperiment.textContent = experimentId || "No experiment";
  await loadEvents();
});

document.querySelector("#list-tools")?.addEventListener("click", () => void boot());
document.querySelector("#pose-table")?.addEventListener("click", async () => show(await window.chem0.readResource("lerobot://pose-table")));
document.querySelector("#list-ports")?.addEventListener("click", () => void call("list_serial_ports"));
document.querySelector("#list-cameras")?.addEventListener("click", () => void call("list_cameras", { max_id: 5 }));
document.querySelector("#view-camera")?.addEventListener("click", async () => {
  const result = await call("view_camera", { camera_id: 0, width: 640, height: 360, format: "jpeg", quality: 80 });
  const content = (result.content ?? []) as Array<{ type: string; data?: string; mimeType?: string }>;
  const image = content.find((item) => item.type === "image");
  if (image?.data && image.mimeType) cameraFrame.src = `data:${image.mimeType};base64,${image.data}`;
});
document.querySelector("#get-arm-pose")?.addEventListener("click", () => void call("get_arm_pose"));
document.querySelector("#get-position")?.addEventListener("click", () => void call("get_position"));
document.querySelector("#open-gripper")?.addEventListener("click", () => void call("open_gripper"));
document.querySelector("#close-gripper")?.addEventListener("click", () => void call("close_gripper"));
document.querySelector("#ask-export")?.addEventListener("click", () => void call("ask_export", { question: "Is this operation safe?" }));
document.querySelector("#call-tool")?.addEventListener("click", async () => {
  try {
    await call(toolSelect.value, parseArgs());
  } catch (error) {
    show(error instanceof Error ? error.message : String(error));
  }
});

sendMessage.addEventListener("click", async () => {
  const message = chatInput.value.trim();
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
  if (event.type === "tool_response") appendChat("tool", `${String(event.name ?? "tool")} response`);
  if (event.type === "error") appendChat("error", String(event.message ?? ""));
});

void boot();
