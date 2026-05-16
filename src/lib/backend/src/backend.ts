import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import { AudioService } from "./audio";
import { PythonBridge } from "./pythonBridge";
import { Chem0Store } from "./store";
import type { Experiment, JsonObject } from "./types";

const DEFAULT_MODEL = "gpt-5.5";
const MAX_AGENT_STEPS = 8;
const ROBOT_TOOL_NAMES = new Set([
  "connect_so101",
  "observe",
  "get_arm_pose",
  "get_position",
  "set_arm_pose",
  "set_position",
  "open_gripper",
  "close_gripper",
  "move_relative",
  "disconnect"
]);

export class Chem0Backend extends EventEmitter {
  readonly store: Chem0Store;
  readonly bridge: PythonBridge;
  readonly audio: AudioService;
  private initialized = false;
  private defaultRobotId: string | null = null;

  constructor(readonly repoRoot: string, dataDir = path.join(repoRoot, "data")) {
    super();
    this.loadEnv();
    this.store = new Chem0Store(repoRoot, dataDir);
    this.audio = new AudioService(dataDir);
    this.bridge = new PythonBridge(repoRoot);
    this.bridge.on("stderr", (text) => this.emit("stderr", text));
  }

  private loadEnv(): void {
    const envPath = path.join(this.repoRoot, ".env");
    if (!fs.existsSync(envPath) || typeof process.loadEnvFile !== "function") return;
    process.loadEnvFile(envPath);
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
    if (name === "set_default_robot") {
      const robotId = String(args.robot_id ?? "").trim();
      if (!robotId) throw new Error("set_default_robot requires robot_id.");
      this.defaultRobotId = robotId;
      return { robot_id: robotId };
    }
    if (name === "get_default_robot") {
      return { robot_id: this.defaultRobotId };
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
        type: "tool_call",
        name,
        content: { arguments: { value, note } }
      });
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
      const result = { ok: true, value, note, timestamp };
      this.store.appendEvent({ experimentId: experimentIdArg, type: "tool_response", name, content: result });
      return result;
    }

    const experimentId = typeof args.experiment_id === "string" ? args.experiment_id : undefined;
    const cleanArgs = this.withRobotId(name, { ...args });
    delete cleanArgs.experiment_id;
    if (experimentId) {
      this.store.appendEvent({ experimentId, type: "tool_call", name, content: { arguments: cleanArgs } });
    }
    const result = await this.executeTool(name, cleanArgs);
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
        "You are controlling a local LeRobot experiment through chem-0. Use tools when hardware state, camera state, arm motion, or human voice interaction is required. Use speak_to_human to talk out loud. Treat listen_to_human transcripts as human messages. When you observe a universal-indicator color in a camera frame, estimate the pH and call record_ph(value) so the operator's real-time chart updates. Keep motions conservative and prefer known pose-table references.";
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
    const audio = result.audio;
    if (audio && typeof audio === "object" && !Array.isArray(audio)) {
      const audioObject = audio as JsonObject;
      if (typeof audioObject.absolute_path === "string") {
        const mimeType = typeof audioObject.mime_type === "string" ? audioObject.mime_type : "application/octet-stream";
        const artifact = this.store.writeArtifact(
          experimentId,
          "tool_audio",
          mimeType,
          fs.readFileSync(audioObject.absolute_path),
          { tool: toolName }
        );
        artifacts.push(artifact);
      }
    }
    if (artifacts.length === 0) return result;
    return { ...result, artifacts };
  }

  private async executeTool(name: string, args: JsonObject): Promise<JsonObject> {
    if (name === "speak_to_human") return this.audio.speakToHuman(args);
    if (name === "listen_to_human") return this.audio.listenToHuman(args);
    return this.bridge.request("tools/call", { name, arguments: args });
  }

  private withExperimentId(tool: JsonObject): JsonObject {
    const schema = (tool.inputSchema ?? {}) as JsonObject;
    const properties = ((schema.properties ?? {}) as JsonObject);
    const shouldIncludeRobot = typeof tool.name === "string" && ROBOT_TOOL_NAMES.has(tool.name);
    return {
      ...tool,
      inputSchema: {
        ...schema,
        properties: {
          ...properties,
          experiment_id: {
            type: "string",
            description: "Optional experiment id used by the Node backend to log MCP tool calls and responses."
          },
          ...(shouldIncludeRobot
            ? {
                robot_id: {
                  type: ["string", "null"],
                  default: null,
                  description: "Optional robot selector. If omitted or null, the backend default robot is used."
                }
              }
            : {})
        }
      }
    };
  }

  private withRobotId(name: string, args: JsonObject): JsonObject {
    if (!ROBOT_TOOL_NAMES.has(name)) return args;
    if (typeof args.robot_id === "string" && args.robot_id.trim()) return args;
    if (this.defaultRobotId) return { ...args, robot_id: this.defaultRobotId };
    delete args.robot_id;
    return args;
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
        name: "set_default_robot",
        description: "Set the backend default robot id used when robot tools omit robot_id.",
        inputSchema: {
          type: "object",
          properties: {
            robot_id: { type: "string" }
          },
          required: ["robot_id"],
          additionalProperties: false
        }
      },
      {
        name: "get_default_robot",
        description: "Return the backend default robot id, or null if no default has been set.",
        inputSchema: {
          type: "object",
          properties: {},
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
            note: { type: "string" },
            experiment_id: { type: "string" }
          },
          required: ["value", "experiment_id"],
          additionalProperties: false
        }
      },
      {
        name: "speak_to_human",
        description:
          "Speak a short message to the nearby human. Uses ElevenLabs when ELEVENLABS_API_KEY is configured, or macOS system speech with provider: system.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "The exact message to speak aloud." },
            provider: { type: "string", enum: ["openai", "elevenlabs", "system"], default: "openai" },
            voice: { type: "string", description: "Optional OpenAI TTS voice." },
            voice_id: { type: "string", description: "Optional ElevenLabs voice id." },
            model_id: { type: "string", description: "Optional provider model id." },
            instructions: { type: "string", description: "Optional OpenAI TTS style instructions." },
            response_format: { type: "string", enum: ["mp3", "opus", "aac", "flac", "wav", "pcm"], default: "mp3" },
            play: { type: "boolean", default: true },
            experiment_id: { type: "string" }
          },
          required: ["text"],
          additionalProperties: false
        }
      },
      {
        name: "listen_to_human",
        description:
          "Transcribe human speech from an audio file or Electron-recorded audio clip. Requires OPENAI_API_KEY.",
        inputSchema: {
          type: "object",
          properties: {
            audio_path: { type: "string", description: "Local audio file path visible to the backend process." },
            audio_base64: { type: "string", description: "Base64 audio payload, primarily used by the Electron recorder." },
            mime_type: { type: "string", default: "audio/webm" },
            language: { type: "string" },
            model: { type: "string", default: "gpt-4o-mini-transcribe" },
            experiment_id: { type: "string" }
          },
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
