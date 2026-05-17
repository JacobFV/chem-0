export {};
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

const datasetInput = document.querySelector<HTMLInputElement>("#replay-dataset")!;
const episodeInput = document.querySelector<HTMLInputElement>("#replay-episode")!;
const portInput = document.querySelector<HTMLInputElement>("#replay-port")!;
const startBtn = document.querySelector<HTMLButtonElement>("#replay-start")!;
const statusPre = document.querySelector<HTMLPreElement>("#replay-status")!;
const resultPre = document.querySelector<HTMLPreElement>("#replay-result")!;

async function startReplay() {
  const repoId = datasetInput.value.trim();
  if (!repoId) {
    statusPre.textContent = "Enter a dataset repo ID";
    return;
  }
  startBtn.disabled = true;
  statusPre.textContent = "Replaying...";
  resultPre.textContent = "";

  const args: Record<string, unknown> = {
    repo_id: repoId,
    episode: parseInt(episodeInput.value, 10) || 0,
  };
  const port = portInput.value.trim();
  if (port) args.port = port;

  const result = await api.callTool("replay_episode", args);
  startBtn.disabled = false;

  if (result.isError) {
    statusPre.textContent = "Replay failed";
    resultPre.textContent = textContent(result) || "unknown error";
    return;
  }

  const parsed = safeParse(result);
  statusPre.textContent = `Replay complete: ${String(parsed.frames_replayed ?? 0)} frames replayed`;
  resultPre.textContent = JSON.stringify(parsed, null, 2);
}

startBtn.addEventListener("click", () => void startReplay());