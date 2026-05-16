import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import initSqlJs, { Database, SqlJsStatic, SqlValue } from "sql.js";
import type { AgentSession, AgentSessionEvent, AgentSessionEventType, Experiment, JsonObject } from "./types";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

export class Chem0Store {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  readonly dataDir: string;
  readonly dbPath: string;
  readonly blobDir: string;

  constructor(repoRoot: string, dataDir = path.join(repoRoot, "data")) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, "chem0.sqlite");
    this.blobDir = path.join(dataDir, "blobs");
  }

  async init(): Promise<void> {
    fs.mkdirSync(this.blobDir, { recursive: true });
    this.SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      this.db = new this.SQL.Database(fs.readFileSync(this.dbPath));
    } else {
      this.db = new this.SQL.Database();
    }
    this.exec(`
      create table if not exists experiments (
        id text primary key,
        name text not null,
        status text not null,
        created_at text not null,
        updated_at text not null,
        metadata_json text not null
      );
      create table if not exists agent_sessions (
        id text primary key,
        experiment_id text not null,
        model text not null,
        status text not null,
        created_at text not null,
        updated_at text not null,
        foreign key (experiment_id) references experiments(id)
      );
      create table if not exists agent_session_events (
        id text primary key,
        experiment_id text not null,
        session_id text,
        type text not null,
        role text,
        name text,
        content_json text not null,
        artifact_id text,
        created_at text not null,
        foreign key (experiment_id) references experiments(id),
        foreign key (session_id) references agent_sessions(id)
      );
      create table if not exists experiment_artifacts (
        id text primary key,
        experiment_id text not null,
        kind text not null,
        mime_type text not null,
        relative_path text not null,
        metadata_json text not null,
        created_at text not null,
        foreign key (experiment_id) references experiments(id)
      );
    `);
    this.save();
  }

  createExperiment(name = "Untitled experiment", metadata: JsonObject = {}): Experiment {
    const created = now();
    const experiment: Experiment = {
      id: id("exp"),
      name,
      status: "active",
      created_at: created,
      updated_at: created,
      metadata
    };
    this.run(
      "insert into experiments values (?, ?, ?, ?, ?, ?)",
      [experiment.id, experiment.name, experiment.status, experiment.created_at, experiment.updated_at, JSON.stringify(metadata)]
    );
    this.save();
    return experiment;
  }

  listExperiments(): Experiment[] {
    return this.query("select * from experiments order by created_at desc").map((row) => ({
      id: String(row.id),
      name: String(row.name),
      status: String(row.status),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      metadata: JSON.parse(String(row.metadata_json)) as JsonObject
    }));
  }

  createSession(experimentId: string, model = "gpt-5.5"): AgentSession {
    const created = now();
    const session: AgentSession = {
      id: id("sess"),
      experiment_id: experimentId,
      model,
      status: "active",
      created_at: created,
      updated_at: created
    };
    this.run("insert into agent_sessions values (?, ?, ?, ?, ?, ?)", [
      session.id,
      session.experiment_id,
      session.model,
      session.status,
      session.created_at,
      session.updated_at
    ]);
    this.save();
    return session;
  }

  listSessions(experimentId: string): AgentSession[] {
    return this.query("select * from agent_sessions where experiment_id = ? order by created_at asc", [experimentId]).map((row) => ({
      id: String(row.id),
      experiment_id: String(row.experiment_id),
      model: String(row.model),
      status: String(row.status),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at)
    }));
  }

  appendEvent(input: {
    experimentId: string;
    sessionId?: string | null;
    type: AgentSessionEventType;
    role?: string | null;
    name?: string | null;
    content?: JsonObject;
    artifactId?: string | null;
  }): AgentSessionEvent {
    const event: AgentSessionEvent = {
      id: id("evt"),
      experiment_id: input.experimentId,
      session_id: input.sessionId ?? null,
      type: input.type,
      role: input.role ?? null,
      name: input.name ?? null,
      content: input.content ?? {},
      artifact_id: input.artifactId ?? null,
      created_at: now()
    };
    this.run("insert into agent_session_events values (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      event.id,
      event.experiment_id,
      event.session_id,
      event.type,
      event.role,
      event.name,
      JSON.stringify(event.content),
      event.artifact_id,
      event.created_at
    ]);
    this.save();
    return event;
  }

  listEvents(experimentId: string): AgentSessionEvent[] {
    return this.query("select * from agent_session_events where experiment_id = ? order by created_at asc", [experimentId]).map((row) => ({
      id: String(row.id),
      experiment_id: String(row.experiment_id),
      session_id: row.session_id == null ? null : String(row.session_id),
      type: String(row.type) as AgentSessionEventType,
      role: row.role == null ? null : String(row.role),
      name: row.name == null ? null : String(row.name),
      content: JSON.parse(String(row.content_json)) as JsonObject,
      artifact_id: row.artifact_id == null ? null : String(row.artifact_id),
      created_at: String(row.created_at)
    }));
  }

  listArtifacts(experimentId: string): JsonObject[] {
    return this.query("select * from experiment_artifacts where experiment_id = ? order by created_at asc", [experimentId]).map((row) => ({
      id: String(row.id),
      experiment_id: String(row.experiment_id),
      kind: String(row.kind),
      mime_type: String(row.mime_type),
      relative_path: String(row.relative_path),
      metadata: JSON.parse(String(row.metadata_json)) as JsonObject,
      created_at: String(row.created_at)
    }));
  }

  writeArtifact(experimentId: string, kind: string, mimeType: string, data: Buffer, metadata: JsonObject = {}): JsonObject {
    const artifactId = id("art");
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("jpeg") ? "jpg" : "bin";
    const relativePath = path.join("blobs", experimentId, `${artifactId}.${ext}`);
    const absolutePath = path.join(this.dataDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, data);
    this.run("insert into experiment_artifacts values (?, ?, ?, ?, ?, ?, ?)", [
      artifactId,
      experimentId,
      kind,
      mimeType,
      relativePath,
      JSON.stringify(metadata),
      now()
    ]);
    this.save();
    return { id: artifactId, experiment_id: experimentId, kind, mime_type: mimeType, relative_path: relativePath, metadata };
  }

  private get database(): Database {
    if (!this.db) throw new Error("Store is not initialized.");
    return this.db;
  }

  private exec(sql: string): void {
    this.database.exec(sql);
  }

  private run(sql: string, params: SqlValue[]): void {
    const stmt = this.database.prepare(sql);
    try {
      stmt.run(params);
    } finally {
      stmt.free();
    }
  }

  private query(sql: string, params: SqlValue[] = []): Record<string, unknown>[] {
    const stmt = this.database.prepare(sql);
    const rows: Record<string, unknown>[] = [];
    try {
      stmt.bind(params);
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally {
      stmt.free();
    }
    return rows;
  }

  private save(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.dbPath, Buffer.from(this.database.export()));
  }
}
