type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export {};

declare global {
  interface Window {
    chem0: {
      listTools: () => Promise<JsonObject>;
      readResource: (uri: string) => Promise<JsonObject>;
      callTool: (name: string, args?: JsonObject) => Promise<JsonObject>;
    };
  }
}

const reasoning = document.querySelector<HTMLPreElement>("#reasoning");
const camFrames: (HTMLImageElement | null)[] = [
  document.querySelector<HTMLImageElement>("#cam-0"),
  document.querySelector<HTMLImageElement>("#cam-1"),
  document.querySelector<HTMLImageElement>("#cam-2"),
];

function show(value: unknown): void {
  if (!reasoning) return;
  reasoning.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function call(name: string, args: JsonObject = {}): Promise<JsonObject> {
  const result = await window.chem0.callTool(name, args);
  show(result);
  return result;
}

async function refreshCamera(id: number): Promise<void> {
  const target = camFrames[id];
  if (!target) return;
  try {
    const result = await window.chem0.callTool("view_camera", {
      camera_id: id,
      width: 640,
      height: 360,
      format: "jpeg",
      quality: 80,
    });
    const content = (result.content ?? []) as Array<{ type: string; data?: string; mimeType?: string }>;
    const image = content.find((item) => item.type === "image");
    if (image?.data && image.mimeType) target.src = `data:${image.mimeType};base64,${image.data}`;
  } catch {
    // leave frame blank if this camera id isn't available
  }
}

async function boot(): Promise<void> {
  const result = await window.chem0.listTools();
  show(result);
  void Promise.all([refreshCamera(0), refreshCamera(1), refreshCamera(2)]);
}

document.querySelector("#list-tools")?.addEventListener("click", () => void boot());
document.querySelector("#pose-table")?.addEventListener("click", async () => show(await window.chem0.readResource("lerobot://pose-table")));
document.querySelector("#ask-export")?.addEventListener("click", () => void call("ask_export", { question: "Is this operation safe?" }));

void boot();
