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
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  metadata: JsonObject;
}

export interface AgentSession {
  id: string;
  experiment_id: string;
  model: string;
  status: string;
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
