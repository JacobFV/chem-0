import { EventEmitter } from "node:events";
import path from "node:path";
import OpenAI from "openai";
import { PythonBridge } from "./pythonBridge";
import { Chem0Store } from "./store";
import type { Experiment, JsonObject } from "./types";

const DEFAULT_MODEL = "gpt-4o";
const MAX_AGENT_STEPS = 8;

export class Chem0Backend extends EventEmitter {
  readonly store: Chem0Store;
  readonly bridge: PythonBridge;
  private initialized = false;

  constructor(readonly repoRoot: string, dataDir = path.join(repoRoot, "data")) {
    super();
    this.store = new Chem0Store(repoRoot, dataDir);
    this.bridge = new PythonBridge(repoRoot);
    this.bridge.on("stderr", (text) => this.emit("stderr", text));
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.store.init();
    this.bridge.start();
    this.initialized = true;
  }

  async listTools(): Promise<JsonObject> {
    await this.init();
    const result = await this.bridge.request("tools/list");
    const tools = ((result.tools ?? []) as JsonObject[]).map((tool) => this.withExperimentId(tool));
    return { tools: [...tools, ...this.backendTools()] };
  }

  async readResource(uri: string): Promise<JsonObject> {
    await this.init();
    return this.bridge.request("resources/read", { uri });
  }

  async callTool(name: string, args: JsonObject = {}): Promise<JsonObject> {
    await this.init();
    if (name === "create_experiment") {
      return this.createExperiment(String(args.name ?? "Untitled experiment"), (args.metadata as JsonObject) ?? {});
    }
    if (name === "list_experiments") {
      return { experiments: this.store.listExperiments() as unknown as JsonObject[] };
    }
    if (name === "list_agent_session_events") {
      return { events: this.store.listEvents(String(args.experiment_id)) as unknown as JsonObject[] };
    }
    if (name === "list_experiment_artifacts") {
      return { artifacts: this.store.listArtifacts(String(args.experiment_id)) };
    }
    if (name === "record_ph") {
      const value = Number(args.value);
      const note = typeof args.note === "string" ? args.note : "";
      const experimentIdArg = typeof args.experiment_id === "string" ? args.experiment_id : "";
      if (!experimentIdArg) return { ok: false, error: "experiment_id required" };
      if (!Number.isFinite(value)) return { ok: false, error: "value must be numeric" };
      const timestamp = Date.now();
      this.store.appendEvent({
        experimentId: experimentIdArg,
        type: "ph_sample",
        role: "system",
        content: { value, note, timestamp }
      });
      this.emit("agent-event", {
        type: "ph_sample",
        experiment_id: experimentIdArg,
        value,
        note,
        timestamp
      });
      return { ok: true, value, timestamp };
    }

    const experimentId = typeof args.experiment_id === "string" ? args.experiment_id : undefined;
    const cleanArgs = { ...args };
    delete cleanArgs.experiment_id;
    if (experimentId) {
      this.store.appendEvent({ experimentId, type: "tool_call", name, content: { arguments: cleanArgs } });
    }
    const result = await this.bridge.request("tools/call", { name, arguments: cleanArgs });
    if (experimentId) {
      const enriched = this.persistArtifacts(experimentId, name, result);
      this.store.appendEvent({ experimentId, type: "tool_response", name, content: enriched });
      return enriched;
    }
    return result;
  }

  createExperiment(name: string, metadata: JsonObject = {}): JsonObject {
    const experiment = this.store.createExperiment(name, metadata);
    const session = this.store.createSession(experiment.id, DEFAULT_MODEL);
    this.store.appendEvent({
      experimentId: experiment.id,
      sessionId: session.id,
      type: "message",
      role: "system",
      content: { text: "Experiment created." }
    });
    return { experiment: experiment as unknown as JsonObject, session: session as unknown as JsonObject };
  }

  listExperiments(): Experiment[] {
    return this.store.listExperiments();
  }

  async streamAgentMessage(input: {
    experimentId: string;
    sessionId?: string;
    message: string;
    model?: string;
  }): Promise<void> {
    await this.init();
    const sessionId = input.sessionId ?? this.store.createSession(input.experimentId, input.model ?? DEFAULT_MODEL).id;
    const model = input.model ?? DEFAULT_MODEL;
    this.store.appendEvent({
      experimentId: input.experimentId,
      sessionId,
      type: "message",
      role: "user",
      content: { text: input.message }
    });
    this.emit("agent-event", { type: "message", role: "user", text: input.message, experiment_id: input.experimentId, session_id: sessionId });

    const client = new OpenAI();
    try {
      let text = "";
      const instructions =
        "You are controlling a local LeRobot experiment through chem-0. Use tools when hardware state, camera state, or arm motion is required. Keep motions conservative and prefer known pose-table references. When you observe a universal-indicator color in a camera frame, estimate the pH and call record_ph(value) so the operator's real-time chart updates.";
      let nextInput: unknown = this.sessionMessages(input.experimentId, sessionId);
      let previousResponseId: string | undefined;
      const tools = await this.openAiTools();

      for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
        const stream = await client.responses.create({
          model,
          instructions,
          input: nextInput as never,
          previous_response_id: previousResponseId,
          tools: tools as never,
          stream: true
        });
        let response: unknown = null;
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            text += event.delta;
            this.store.appendEvent({
              experimentId: input.experimentId,
              sessionId,
              type: "assistant_delta",
              role: "assistant",
              content: { text: event.delta }
            });
            this.emit("agent-event", {
              type: "assistant_delta",
              text: event.delta,
              experiment_id: input.experimentId,
              session_id: sessionId
            });
          }
          if (event.type === "response.completed") {
            response = event.response;
          }
        }

        const completed = response as {
          id?: string;
          output?: Array<{ type?: string; call_id?: string; name?: string; arguments?: string }>;
        } | null;
        previousResponseId = completed?.id ?? previousResponseId;
        const calls = (completed?.output ?? []).filter((item) => item.type === "function_call" && item.call_id && item.name);
        if (calls.length === 0) {
          this.store.appendEvent({
            experimentId: input.experimentId,
            sessionId,
            type: "assistant_done",
            role: "assistant",
            content: { text, response: (completed ?? {}) as unknown as JsonObject }
          });
          this.store.appendEvent({
            experimentId: input.experimentId,
            sessionId,
            type: "message",
            role: "assistant",
            content: { text }
          });
          this.emit("agent-event", { type: "assistant_done", text, experiment_id: input.experimentId, session_id: sessionId });
          return;
        }

        const outputs: JsonObject[] = [];
        for (const call of calls) {
          const toolArgs = this.parseToolArguments(call.arguments ?? "{}");
          const result = await this.callTool(String(call.name), { ...toolArgs, experiment_id: input.experimentId });
          outputs.push({
            type: "function_call_output",
            call_id: String(call.call_id),
            output: JSON.stringify(result)
          });
          this.emit("agent-event", {
            type: "tool_response",
            name: String(call.name),
            result,
            experiment_id: input.experimentId,
            session_id: sessionId
          });
        }
        nextInput = outputs;
      }

      this.store.appendEvent({
        experimentId: input.experimentId,
        sessionId,
        type: "error",
        role: "system",
        content: { message: `Agent exceeded ${MAX_AGENT_STEPS} tool iterations.` }
      });
      this.emit("agent-event", {
        type: "error",
        message: `Agent exceeded ${MAX_AGENT_STEPS} tool iterations.`,
        experiment_id: input.experimentId,
        session_id: sessionId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.appendEvent({
        experimentId: input.experimentId,
        sessionId,
        type: "error",
        role: "system",
        content: { message }
      });
      this.emit("agent-event", { type: "error", message, experiment_id: input.experimentId, session_id: sessionId });
    }
  }

  stop(): void {
    this.bridge.stop();
  }

  private persistArtifacts(experimentId: string, toolName: string, result: JsonObject): JsonObject {
    const content = Array.isArray(result.content) ? result.content : [];
    const artifacts: JsonObject[] = [];
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const block = item as JsonObject;
      if (block.type !== "image" || typeof block.data !== "string") continue;
      const mimeType = typeof block.mimeType === "string" ? block.mimeType : "application/octet-stream";
      const artifact = this.store.writeArtifact(
        experimentId,
        "tool_image",
        mimeType,
        Buffer.from(block.data, "base64"),
        { tool: toolName }
      );
      artifacts.push(artifact);
    }
    if (artifacts.length === 0) return result;
    return { ...result, artifacts };
  }

  private withExperimentId(tool: JsonObject): JsonObject {
    const schema = (tool.inputSchema ?? {}) as JsonObject;
    const properties = ((schema.properties ?? {}) as JsonObject);
    return {
      ...tool,
      inputSchema: {
        ...schema,
        properties: {
          ...properties,
          experiment_id: {
            type: "string",
            description: "Optional experiment id used by the Node backend to log MCP tool calls and responses."
          }
        }
      }
    };
  }

  private backendTools(): JsonObject[] {
    return [
      {
        name: "create_experiment",
        description: "Create a tracked experiment and default agent session in the Node backend.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            metadata: { type: "object", additionalProperties: true }
          },
          additionalProperties: false
        }
      },
      {
        name: "list_experiments",
        description: "List tracked experiments from the local SQLite store.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "list_agent_session_events",
        description: "List logged agent session events for an experiment.",
        inputSchema: {
          type: "object",
          properties: { experiment_id: { type: "string" } },
          required: ["experiment_id"],
          additionalProperties: false
        }
      },
      {
        name: "list_experiment_artifacts",
        description: "List blob-store artifact references for an experiment.",
        inputSchema: {
          type: "object",
          properties: { experiment_id: { type: "string" } },
          required: ["experiment_id"],
          additionalProperties: false
        }
      },
      {
        name: "record_ph",
        description: "Record a pH reading (typically 0-14) for the current experiment after observing the universal indicator color from a camera frame. Updates the operator's real-time pH chart.",
        inputSchema: {
          type: "object",
          properties: {
            value: { type: "number" },
            note: { type: "string" }
          },
          required: ["value"],
          additionalProperties: false
        }
      }
    ];
  }

  private sessionMessages(experimentId: string, sessionId: string): JsonObject[] {
    return this.store
      .listEvents(experimentId)
      .filter((event) => event.session_id === sessionId && (event.type === "message" || event.type === "assistant_done"))
      .filter((event) => event.role === "user" || event.role === "assistant")
      .map((event) => ({
        role: event.role,
        content: typeof event.content.text === "string" ? event.content.text : JSON.stringify(event.content)
      }));
  }

  private async openAiTools(): Promise<JsonObject[]> {
    const listed = await this.listTools();
    return ((listed.tools ?? []) as JsonObject[])
      .filter((tool) => tool.name !== "create_experiment")
      .map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema ?? { type: "object", properties: {} }
      }));
  }

  private parseToolArguments(raw: string): JsonObject {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonObject;
    } catch {
      // Fall through to an empty argument object.
    }
    return {};
  }
}
