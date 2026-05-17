type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const api = (window as unknown as { chem0: { callTool: (name: string, args?: Record<string, unknown>) => Promise<JsonObject> } }).chem0;

function textContent(result: JsonObject): string {
  const c = result.content;
  if (Array.isArray(c) && c.length > 0 && typeof c[0] === "object" && c[0] !== null) {
    const text = (c[0] as JsonObject).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

function safeParse(result: JsonObject): JsonObject {
  const t = textContent(result);
  if (!t) return result;
  try { return JSON.parse(t) as JsonObject; } catch { return result; }
}

const datasetInput = document.querySelector<HTMLInputElement>("#train-dataset")!;
const policySelect = document.querySelector<HTMLSelectElement>("#train-policy-type")!;
const stepsInput = document.querySelector<HTMLInputElement>("#train-steps")!;
const batchInput = document.querySelector<HTMLInputElement>("#train-batch-size")!;
const outputDirInput = document.querySelector<HTMLInputElement>("#train-output-dir")!;
const startBtn = document.querySelector<HTMLButtonElement>("#train-start")!;
const stopBtn = document.querySelector<HTMLButtonElement>("#train-stop")!;
const statusPre = document.querySelector<HTMLPreElement>("#train-status")!;
const logPre = document.querySelector<HTMLPreElement>("#train-log")!;
const checkpointDiv = document.querySelector<HTMLDivElement>("#checkpoint-list")!;
const refreshBtn = document.querySelector<HTMLButtonElement>("#refresh-checkpoints")!;

let sessionId = "";
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function startTraining() {
  if (sessionId) return;
  const result = await api.callTool("train_policy", {
    dataset_repo_id: datasetInput.value.trim(),
    policy_type: policySelect.value,
    steps: parseInt(stepsInput.value, 10) || 50000,
    batch_size: parseInt(batchInput.value, 10) || 8,
    output_dir: outputDirInput.value.trim() || "outputs/train",
    wandb_enable: false,
  });
  if (result.isError) {
    statusPre.textContent = `Error: ${textContent(result) || "unknown"}`;
    return;
  }
  const parsed = safeParse(result);
  sessionId = (parsed.session_id as string) ?? "";
  statusPre.textContent = "Training started";
  startBtn.disabled = true;
  stopBtn.disabled = false;
  logPre.textContent = "";
  pollTimer = setInterval(pollStatus, 2000);
}

async function stopTraining() {
  if (!sessionId) return;
  const result = await api.callTool("stop_training", { session_id: sessionId });
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  sessionId = "";
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusPre.textContent = "Training stopped";
  const t = textContent(result);
  if (t) logPre.textContent += "\n--- STOPPED ---\n" + t;
}

async function pollStatus() {
  if (!sessionId) return;
  const result = await api.callTool("get_training_status", { session_id: sessionId });
  if (result.isError) {
    statusPre.textContent = `Poll error: ${textContent(result) || "unknown"}`;
    return;
  }
  const parsed = safeParse(result);
  const done = parsed.done === true;
  const alive = parsed.alive === true;
  const lines = (parsed.log_lines as string[]) ?? [];

  for (const line of lines) {
    if (!logPre.textContent.includes(line)) {
      logPre.textContent += line + "\n";
    }
  }
  logPre.scrollTop = logPre.scrollHeight;

  if (done) {
    statusPre.textContent = "Training complete!";
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    startBtn.disabled = false;
    stopBtn.disabled = true;
    sessionId = "";
    await listCheckpoints();
  } else if (!alive) {
    statusPre.textContent = "Process ended (check log for errors)";
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    startBtn.disabled = false;
    stopBtn.disabled = true;
    sessionId = "";
  } else {
    const last = lines.length > 0 ? lines[lines.length - 1] : "";
    statusPre.textContent = `Training... ${last}`;
  }
}

async function listCheckpoints() {
  const result = await api.callTool("list_checkpoints", { output_dir: outputDirInput.value.trim() || "outputs/train" });
  if (result.isError) {
    checkpointDiv.textContent = "Error listing checkpoints";
    return;
  }
  const parsed = safeParse(result);
  const checkpoints = (parsed.checkpoints as Array<{ step: number; path: string; parent: string }>) ?? [];
  if (checkpoints.length === 0) {
    checkpointDiv.textContent = "No checkpoints found.";
    return;
  }
  checkpointDiv.innerHTML = checkpoints
    .sort((a, b) => b.step - a.step)
    .map((cp) => `<div style="padding: 4px 0;">step ${cp.step} — ${cp.path}</div>`)
    .join("");
}

startBtn.addEventListener("click", () => void startTraining());
stopBtn.addEventListener("click", () => void stopTraining());
refreshBtn.addEventListener("click", () => void listCheckpoints());

void listCheckpoints();
