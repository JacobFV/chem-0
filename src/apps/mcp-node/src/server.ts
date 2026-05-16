#!/usr/bin/env node
import path from "node:path";
import { Chem0Backend, type JsonObject } from "@chem0/backend";

const PROTOCOL_VERSION = "2024-11-05";
const repoRoot = path.resolve(__dirname, "../../../..");
const backend = new Chem0Backend(repoRoot);

function result(id: unknown, value: unknown): JsonObject {
  return { jsonrpc: "2.0", id: id as never, result: value as never };
}

function error(id: unknown, code: number, message: string): JsonObject {
  return { jsonrpc: "2.0", id: id as never, error: { code, message } as never };
}

async function handle(request: JsonObject): Promise<JsonObject | null> {
  const id = request.id;
  if (id == null) return null;
  const method = String(request.method ?? "");
  const params = (request.params ?? {}) as JsonObject;
  try {
    if (method === "initialize") {
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "chem0-node-mcp", version: "0.2.0" }
      });
    }
    if (method === "resources/list") {
      return result(id, { resources: [{ uri: "lerobot://pose-table", name: "LeRobot SO-101 pose table", mimeType: "application/json" }] });
    }
    if (method === "resources/read") return result(id, await backend.readResource(String(params.uri ?? "")));
    if (method === "tools/list") {
      return result(id, await backend.listTools());
    }
    if (method === "tools/call") {
      return result(id, await backend.callTool(String(params.name ?? ""), (params.arguments ?? {}) as JsonObject));
    }
    return error(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    return error(id, -32000, err instanceof Error ? err.message : String(err));
  }
}

function write(message: JsonObject): void {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  void pump();
});

async function pump(): Promise<void> {
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) throw new Error(`Invalid header: ${header}`);
    const length = Number(match[1]);
    const start = headerEnd + 4;
    const end = start + length;
    if (buffer.length < end) return;
    const request = JSON.parse(buffer.subarray(start, end).toString("utf8")) as JsonObject;
    buffer = buffer.subarray(end);
    const response = await handle(request);
    if (response) write(response);
  }
}

process.on("exit", () => backend.stop());
