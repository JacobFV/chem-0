import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import { AudioService } from "./audio";
import { PythonBridge } from "./pythonBridge";
import { Chem0Store, DEFAULT_PHYSICAL_WORLD_ID } from "./store";
import type { Experiment, JsonObject, RobotKind, WorldType } from "./types";

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
      const worldId = typeof args.world_id === "string" && args.world_id.trim() ? args.world_id : DEFAULT_PHYSICAL_WORLD_ID;
      return this.createExperiment(String(args.name ?? "Untitled experiment"), (args.metadata as JsonObject) ?? {}, worldId);
    }
    if (name === "list_experiments") {
      return { experiments: this.store.listExperiments() as unknown as JsonObject[] };
    }
    if (name === "list_worlds") {
      return {
        worlds: this.store.listWorlds() as unknown as JsonObject[],
        assignments: this.store.listRobotWorldAssignments() as unknown as JsonObject[],
        virtual_entities: this.store.listVirtualEntities() as unknown as JsonObject[]
      };
    }
    if (name === "create_world") {
      return {
        world: this.store.createWorld({
          name: String(args.name ?? ""),
          type: String(args.type ?? "physical") as WorldType,
          metadata: (args.metadata as JsonObject) ?? {}
        }) as unknown as JsonObject
      };
    }
    if (name === "update_world") {
      return {
        world: this.store.updateWorld({
          worldId: String(args.world_id ?? ""),
          name: typeof args.name === "string" ? args.name : undefined,
          metadata: (args.metadata as JsonObject) ?? undefined
        }) as unknown as JsonObject
      };
    }
    if (name === "delete_world") {
      const worldId = String(args.world_id ?? "").trim();
      if (!worldId) throw new Error("delete_world requires world_id.");
      this.store.deleteWorld(worldId);
      return { ok: true, world_id: worldId };
    }
    if (name === "assign_robot_to_world") {
      return {
        assignment: this.store.assignRobotToWorld({
          robotId: String(args.robot_id ?? ""),
          worldId: String(args.world_id ?? ""),
          robotKind: String(args.robot_kind ?? "physical") as RobotKind,
          port: typeof args.port === "string" ? args.port : null,
          metadata: (args.metadata as JsonObject) ?? {},
          makeDefault: args.make_default === true
        }) as unknown as JsonObject
      };
    }
    if (name === "list_virtual_entities") {
      const worldId = typeof args.world_id === "string" && args.world_id.trim() ? args.world_id : undefined;
      return { entities: this.store.listVirtualEntities(worldId) as unknown as JsonObject[] };
    }
    if (name === "create_virtual_arm") {
      const entity = this.store.createVirtualEntity({
        worldId: String(args.world_id ?? ""),
        kind: "arm",
        name: String(args.name ?? "Virtual SO-101"),
        pose: (args.pose as JsonObject) ?? {},
        spec: {
          model: typeof args.model === "string" ? args.model : "so101",
          collision_shape: "so101_urdf",
          collision_mode: "full",
          collides_with: ["rigid_body"],
          ...(args.spec && typeof args.spec === "object" && !Array.isArray(args.spec) ? (args.spec as JsonObject) : {})
        },
        collisionEnabled: true
      });
      const assignment = this.store.assignRobotToWorld({
        robotId: entity.id,
        worldId: entity.world_id,
        robotKind: "virtual",
        metadata: { entity_id: entity.id, model: entity.spec.model ?? "so101", collision_mode: "full" },
        makeDefault: args.make_default === true
      });
      return { entity: entity as unknown as JsonObject, assignment: assignment as unknown as JsonObject };
    }
    if (name === "create_virtual_camera") {
      return {
        entity: this.store.createVirtualEntity({
          worldId: String(args.world_id ?? ""),
          kind: "camera",
          name: String(args.name ?? "Virtual camera"),
          pose: (args.pose as JsonObject) ?? {},
          spec: {
            resolution: "1280x720",
            fov_degrees: 60,
            ...(args.spec && typeof args.spec === "object" && !Array.isArray(args.spec) ? (args.spec as JsonObject) : {})
          },
          collisionEnabled: false
        }) as unknown as JsonObject
      };
    }
    if (name === "create_virtual_rigid_body") {
      return {
        entity: this.store.createVirtualEntity({
          worldId: String(args.world_id ?? ""),
          kind: "rigid_body",
          name: String(args.name ?? "Rigid body"),
          pose: (args.pose as JsonObject) ?? {},
          spec: {
            mass_kg: 0.1,
            collision_shape: "box",
            dimensions_m: [0.05, 0.05, 0.05],
            collision_mode: "full",
            collides_with: ["arm", "rigid_body"],
            ...(args.spec && typeof args.spec === "object" && !Array.isArray(args.spec) ? (args.spec as JsonObject) : {})
          },
          collisionEnabled: args.collision_enabled !== false
        }) as unknown as JsonObject
      };
    }
    if (name === "delete_virtual_entity") {
      const entityId = String(args.entity_id ?? "").trim();
      if (!entityId) throw new Error("delete_virtual_entity requires entity_id.");
      this.store.deleteVirtualEntity(entityId);
      return { ok: true, entity_id: entityId };
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
      const worldId = this.worldIdForArgs(args);
      this.store.setDefaultRobotForWorld(worldId, robotId);
      return { robot_id: robotId, world_id: worldId };
    }
    if (name === "get_default_robot") {
      const worldId = this.worldIdForArgs(args);
      return { robot_id: this.store.getWorld(worldId)?.default_robot_id ?? null, world_id: worldId };
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
    delete cleanArgs.world_id;
    if (experimentId) {
      this.store.appendEvent({ experimentId, type: "tool_call", name, content: { arguments: cleanArgs } });
    }
    const result = await this.executeTool(name, cleanArgs);
    if (name === "list_connected_robots") this.recordDetectedPhysicalRobots(result);
    if (experimentId) {
      const enriched = this.persistArtifacts(experimentId, name, result);
      this.store.appendEvent({ experimentId, type: "tool_response", name, content: enriched });
      return enriched;
    }
    return result;
  }

  createExperiment(name: string, metadata: JsonObject = {}, worldId = DEFAULT_PHYSICAL_WORLD_ID): JsonObject {
    const experiment = this.store.createExperiment(name, metadata, worldId);
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
        "You are controlling a local LeRobot experiment through chem-0. Your agent session is scoped to one world through the experiment; do not ask the user for world_id or pass world_id to tools unless explicitly changing world management. Use tools when hardware state, camera state, arm motion, or human voice interaction is required. Use speak_to_human to talk out loud. Treat listen_to_human transcripts as human messages. When you observe a universal-indicator color in a camera frame, estimate the pH and call record_ph(value) so the operator's real-time chart updates. Keep motions conservative and prefer known pose-table references.";
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
    const worldId = this.worldIdForArgs(args);
    const robotId = this.store.getWorld(worldId)?.default_robot_id;
    if (robotId) return { ...args, robot_id: robotId };
    delete args.robot_id;
    return args;
  }

  private worldIdForArgs(args: JsonObject): string {
    if (typeof args.world_id === "string" && args.world_id.trim()) return args.world_id;
    if (typeof args.experiment_id === "string" && args.experiment_id.trim()) {
      return this.store.getExperiment(args.experiment_id)?.world_id ?? DEFAULT_PHYSICAL_WORLD_ID;
    }
    return DEFAULT_PHYSICAL_WORLD_ID;
  }

  private recordDetectedPhysicalRobots(result: JsonObject): void {
    const parsed = this.parseToolResultJson(result);
    const robots = parsed && Array.isArray(parsed.robots) ? parsed.robots : [];
    for (const raw of robots) {
      if (!raw || typeof raw !== "object") continue;
      const robot = raw as JsonObject;
      const robotId = String(robot.suggested_robot_id ?? robot.robot_id ?? "").trim();
      if (!robotId) continue;
      this.store.assignRobotToWorld({
        robotId,
        worldId: DEFAULT_PHYSICAL_WORLD_ID,
        robotKind: "physical",
        port: typeof robot.port === "string" ? robot.port : null,
        metadata: {
          looks_like_so101: robot.looks_like_so101 === true,
          servo_ids: Array.isArray(robot.servo_ids) ? robot.servo_ids : []
        }
      });
    }
  }

  private parseToolResultJson(result: JsonObject): JsonObject | null {
    const content = result.content;
    const text = Array.isArray(content) && typeof (content[0] as JsonObject | undefined)?.text === "string"
      ? String((content[0] as JsonObject).text)
      : "";
    if (!text) return result;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonObject;
    } catch {
      return null;
    }
    return null;
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
            world_id: {
              type: "string",
              description: "Optional world id. Defaults to the default physical world."
            },
            metadata: { type: "object", additionalProperties: true }
          },
          additionalProperties: false
        }
      },
      {
        name: "list_worlds",
        description: "List physical and virtual worlds plus robot-world assignments.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "create_world",
        description: "Create a physical or virtual world.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["physical", "virtual"] },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["name", "type"],
          additionalProperties: false
        }
      },
      {
        name: "delete_world",
        description: "Delete a world with no experiments. The default physical world is protected.",
        inputSchema: {
          type: "object",
          properties: { world_id: { type: "string" } },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "update_world",
        description: "Update world settings such as display name and metadata.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            name: { type: "string" },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "assign_robot_to_world",
        description: "Assign a physical robot to a physical world or a virtual robot to a virtual world.",
        inputSchema: {
          type: "object",
          properties: {
            robot_id: { type: "string" },
            world_id: { type: "string" },
            robot_kind: { type: "string", enum: ["physical", "virtual"] },
            port: { type: ["string", "null"] },
            make_default: { type: "boolean", default: false },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["robot_id", "world_id", "robot_kind"],
          additionalProperties: false
        }
      },
      {
        name: "list_virtual_entities",
        description: "List virtual arms, cameras, and rigid bodies placed in virtual worlds.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string", description: "Optional virtual world id filter." }
          },
          additionalProperties: false
        }
      },
      {
        name: "create_virtual_arm",
        description:
          "Place a virtual SO-101 arm in a virtual world and register it as a virtual robot. The entity is collidable using full URDF collision mode.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            name: { type: "string" },
            model: { type: "string", default: "so101" },
            pose: { type: "object", additionalProperties: true },
            spec: { type: "object", additionalProperties: true },
            make_default: { type: "boolean", default: false }
          },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "create_virtual_camera",
        description: "Place a virtual camera in a virtual world.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            name: { type: "string" },
            pose: { type: "object", additionalProperties: true },
            spec: { type: "object", additionalProperties: true }
          },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "create_virtual_rigid_body",
        description:
          "Place a virtual rigid body in a virtual world with full collision enabled by default. Provide collision shape, dimensions, and mass through spec.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            name: { type: "string" },
            pose: { type: "object", additionalProperties: true },
            spec: { type: "object", additionalProperties: true },
            collision_enabled: { type: "boolean", default: true }
          },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "delete_virtual_entity",
        description: "Delete a virtual arm, camera, or rigid body.",
        inputSchema: {
          type: "object",
          properties: { entity_id: { type: "string" } },
          required: ["entity_id"],
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
            robot_id: { type: "string" },
            world_id: {
              type: "string",
              description: "Optional world id. Defaults to the experiment world when experiment_id is provided, otherwise the default physical world."
            },
            experiment_id: {
              type: "string",
              description: "Optional experiment id used to infer world scope."
            }
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
          properties: {
            world_id: {
              type: "string",
              description: "Optional world id. Defaults to the experiment world when experiment_id is provided, otherwise the default physical world."
            },
            experiment_id: {
              type: "string",
              description: "Optional experiment id used to infer world scope."
            }
          },
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
