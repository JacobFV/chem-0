import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

class McpStdioClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private buffer = Buffer.alloc(0);
  private pending = new Map<number, { resolve: (value: JsonObject) => void; reject: (error: Error) => void }>();

  constructor(private readonly repoRoot: string) {}

  start(): void {
    if (this.process) return;

    const venvPython = path.join(this.repoRoot, ".venv", "bin", "python");
    const python = existsSync(venvPython) ? venvPython : "python3";
    const server = path.join(this.repoRoot, "src", "apps", "mcp", "server.py");
    this.process = spawn(python, [server], {
      cwd: this.repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" }
    });

    this.process.stdout.on("data", (chunk: Buffer) => this.read(chunk));
    this.process.stderr.on("data", (chunk: Buffer) => console.error(`[chem-0 mcp] ${chunk.toString()}`));
    this.process.on("exit", () => {
      this.process = null;
      for (const pending of this.pending.values()) pending.reject(new Error("MCP server exited."));
      this.pending.clear();
    });
  }

  stop(): void {
    this.process?.kill();
    this.process = null;
  }

  async request(method: string, params: JsonObject = {}): Promise<JsonObject> {
    this.start();
    if (!this.process) throw new Error("MCP server did not start.");

    const id = this.nextId++;
    const payload = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }), "utf8");
    this.process.stdin.write(`Content-Length: ${payload.length}\r\n\r\n`);
    this.process.stdin.write(payload);

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, 30000);
    });
  }

  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;

      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) throw new Error(`Invalid MCP header: ${header}`);

      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) return;

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.subarray(bodyEnd);
      const message = JSON.parse(body) as JsonObject;
      const id = Number(message.id);
      const pending = this.pending.get(id);
      if (!pending) continue;
      this.pending.delete(id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result as JsonObject);
    }
  }
}

const repoRoot = path.resolve(__dirname, "../../../../..");
const mcp = new McpStdioClient(repoRoot);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "chem-0",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  void win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  mcp.start();
  void mcp.request("initialize", {}).catch((error) => console.error(error));
  createWindow();
});

app.on("window-all-closed", () => {
  mcp.stop();
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("chem0:tools-list", async () => mcp.request("tools/list"));
ipcMain.handle("chem0:resource-read", async (_event, uri: string) => mcp.request("resources/read", { uri }));
ipcMain.handle("chem0:tool-call", async (_event, name: string, args: JsonObject) =>
  mcp.request("tools/call", { name, arguments: args })
);
