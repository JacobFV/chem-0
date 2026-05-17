export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type AgentSessionEventType =
  | "message"
  | "assistant_delta"
  | "assistant_done"
  | "tool_call"
  | "tool_response"
  | "artifact"
  | "ph_sample"
  | "audio"
  | "error";

export interface Experiment {
  id: string;
  world_id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  metadata: JsonObject;
}

export interface AgentSession {
  id: string;
  experiment_id: string;
  world_id: string;
  model: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export type WorldType = "physical" | "virtual";

export interface World {
  id: string;
  name: string;
  type: WorldType;
  status: string;
  default_robot_id: string | null;
  created_at: string;
  updated_at: string;
  metadata: JsonObject;
}

export type RobotKind = "physical" | "virtual";

export interface RobotWorldAssignment {
  robot_id: string;
  world_id: string;
  robot_kind: RobotKind;
  port: string | null;
  metadata: JsonObject;
  updated_at: string;
}

export type VirtualEntityKind = "arm" | "camera" | "rigid_body";

export interface VirtualWorldEntity {
  id: string;
  world_id: string;
  kind: VirtualEntityKind;
  name: string;
  pose: JsonObject;
  spec: JsonObject;
  collision_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentSessionEvent {
  id: string;
  experiment_id: string;
  session_id: string | null;
  type: AgentSessionEventType;
  role: string | null;
  name: string | null;
  content: JsonObject;
  artifact_id: string | null;
  created_at: string;
}
