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

const output = document.querySelector<HTMLPreElement>("#output")!;
const toolSelect = document.querySelector<HTMLSelectElement>("#tool")!;
const argsInput = document.querySelector<HTMLTextAreaElement>("#args")!;
const cameraFrame = document.querySelector<HTMLImageElement>("#camera-frame")!;

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

async function call(name: string, args: JsonObject = {}): Promise<JsonObject> {
  const result = await window.chem0.callTool(name, args);
  show(result);
  return result;
}

async function boot(): Promise<void> {
  const result = await window.chem0.listTools();
  const tools = (result.tools ?? []) as Array<{ name: string }>;
  for (const tool of tools) {
    const option = document.createElement("option");
    option.value = tool.name;
    option.textContent = tool.name;
    toolSelect.append(option);
  }
  show(result);
}

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

void boot();
