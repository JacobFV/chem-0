export {};

declare global {
  interface Window {
    chem0: {
      callTool: (name: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
  }
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
  const result = await window.chem0.callTool("train_policy", {
    dataset_repo_id: datasetInput.value.trim(),
    policy_type: policySelect.value,
    steps: parseInt(stepsInput.value, 10) || 50000,
    batch_size: parseInt(batchInput.value, 10) || 8,
    output_dir: outputDirInput.value.trim() || "outputs/train",
    wandb_enable: false,
  });
  if (result.isError) {
    statusPre.textContent = `Error: ${result.content?.[0]?.text ?? "unknown"}`;
    return;
  }
  const parsed = typeof result.content?.[0]?.text === "string" ? JSON.parse(result.content[0].text) : result;
  sessionId = parsed.session_id ?? "";
  statusPre.textContent = "Training started";
  startBtn.disabled = true;
  stopBtn.disabled = false;
  logPre.textContent = "";
  pollTimer = setInterval(pollStatus, 2000);
}

async function stopTraining() {
  if (!sessionId) return;
  const result = await window.chem0.callTool("stop_training", { session_id: sessionId });
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  sessionId = "";
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusPre.textContent = "Training stopped";
  if (result.content?.[0]?.text) {
    logPre.textContent += "\n--- STOPPED ---\n" + result.content[0].text;
  }
}

async function pollStatus() {
  if (!sessionId) return;
  const result = await window.chem0.callTool("get_training_status", { session_id: sessionId });
  if (result.isError) {
    statusPre.textContent = `Poll error: ${result.content?.[0]?.text ?? "unknown"}`;
    return;
  }
  const parsed = typeof result.content?.[0]?.text === "string" ? JSON.parse(result.content[0].text) : result;
  const done = parsed.done === true;
  const alive = parsed.alive === true;
  const lines = (parsed.log_lines ?? []) as string[];

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
  const result = await window.chem0.callTool("list_checkpoints", { output_dir: outputDirInput.value.trim() || "outputs/train" });
  if (result.isError) {
    checkpointDiv.textContent = "Error listing checkpoints";
    return;
  }
  const parsed = typeof result.content?.[0]?.text === "string" ? JSON.parse(result.content[0].text) : result;
  const checkpoints = (parsed.checkpoints ?? []) as Array<{ step: number; path: string; parent: string }>;
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
