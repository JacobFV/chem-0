import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import path from "node:path";
import type { JsonObject } from "./types";

export class PythonBridge extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private buffer = "";
  private pending = new Map<number, { resolve: (value: JsonObject) => void; reject: (error: Error) => void }>();

  constructor(private readonly repoRoot: string) {
    super();
  }

  start(): void {
    if (this.child) return;
    const venvPython = path.join(this.repoRoot, ".venv", "bin", "python");
    const python = existsSync(venvPython) ? venvPython : "python3";
    const script = path.join(this.repoRoot, "src", "apps", "python-bridge", "bridge.py");
    this.child = spawn(python, [script], {
      cwd: this.repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" }
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.read(chunk.toString("utf8")));
    this.child.stderr.on("data", (chunk: Buffer) => this.emit("stderr", chunk.toString("utf8")));
    this.child.on("exit", () => {
      this.child = null;
      for (const pending of this.pending.values()) pending.reject(new Error("Python bridge exited."));
      this.pending.clear();
    });
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
  }

  request(method: string, params: JsonObject = {}): Promise<JsonObject> {
    this.start();
    if (!this.child) throw new Error("Python bridge did not start.");
    const id = this.nextId++;
    this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`Python bridge request timed out: ${method}`));
      }, 60000);
    });
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line) as { id: number; result?: JsonObject; error?: string };
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve(message.result ?? {});
    }
  }
}
