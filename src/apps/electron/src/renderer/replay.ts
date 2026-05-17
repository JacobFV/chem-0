export {};

declare global {
  interface Window {
    chem0: {
      callTool: (name: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
  }
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

  const result = await window.chem0.callTool("replay_episode", args);
  startBtn.disabled = false;

  if (result.isError) {
    statusPre.textContent = "Replay failed";
    resultPre.textContent = result.content?.[0]?.text ?? "unknown error";
    return;
  }

  const parsed = typeof result.content?.[0]?.text === "string" ? JSON.parse(result.content[0].text) : result;
  statusPre.textContent = `Replay complete: ${parsed.frames_replayed ?? 0} frames replayed`;
  resultPre.textContent = JSON.stringify(parsed, null, 2);
}

startBtn.addEventListener("click", () => void startReplay());
