import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import initSqlJs, { Database, SqlJsStatic, SqlValue } from "sql.js";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionEventType,
  Experiment,
  JsonObject,
  RobotKind,
  RobotWorldAssignment,
  VirtualEntityKind,
  VirtualWorldEntity,
  World,
  WorldType
} from "./types";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
export const DEFAULT_PHYSICAL_WORLD_ID = "world_physical_default";

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
      create table if not exists worlds (
        id text primary key,
        name text not null,
        type text not null,
        status text not null,
        default_robot_id text,
        created_at text not null,
        updated_at text not null,
        metadata_json text not null
      );
      create table if not exists robot_world_assignments (
        robot_id text primary key,
        world_id text not null,
        robot_kind text not null,
        port text,
        metadata_json text not null,
        updated_at text not null,
        foreign key (world_id) references worlds(id)
      );
      create table if not exists virtual_world_entities (
        id text primary key,
        world_id text not null,
        kind text not null,
        name text not null,
        pose_json text not null,
        spec_json text not null,
        collision_enabled integer not null,
        created_at text not null,
        updated_at text not null,
        foreign key (world_id) references worlds(id)
      );
      create table if not exists experiments (
        id text primary key,
        world_id text not null,
        name text not null,
        status text not null,
        created_at text not null,
        updated_at text not null,
        metadata_json text not null,
        foreign key (world_id) references worlds(id)
      );
      create table if not exists agent_sessions (
        id text primary key,
        experiment_id text not null,
        world_id text not null,
        model text not null,
        status text not null,
        created_at text not null,
        updated_at text not null,
        foreign key (experiment_id) references experiments(id),
        foreign key (world_id) references worlds(id)
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
    this.migrateWorldColumns();
    this.ensureDefaultPhysicalWorld();
    this.save();
  }

  createExperiment(name = "Untitled experiment", metadata: JsonObject = {}, worldId = DEFAULT_PHYSICAL_WORLD_ID): Experiment {
    const world = this.getWorld(worldId);
    if (!world) throw new Error(`Unknown world_id: ${worldId}`);
    const created = now();
    const experiment: Experiment = {
      id: id("exp"),
      world_id: worldId,
      name,
      status: "active",
      created_at: created,
      updated_at: created,
      metadata
    };
    this.run(
      "insert into experiments values (?, ?, ?, ?, ?, ?, ?)",
      [
        experiment.id,
        experiment.world_id,
        experiment.name,
        experiment.status,
        experiment.created_at,
        experiment.updated_at,
        JSON.stringify(metadata)
      ]
    );
    this.save();
    return experiment;
  }

  listExperiments(): Experiment[] {
    return this.query("select * from experiments order by created_at desc").map((row) => ({
      id: String(row.id),
      world_id: String(row.world_id ?? DEFAULT_PHYSICAL_WORLD_ID),
      name: String(row.name),
      status: String(row.status),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      metadata: JSON.parse(String(row.metadata_json)) as JsonObject
    }));
  }

  getExperiment(experimentId: string): Experiment | null {
    const row = this.query("select * from experiments where id = ? limit 1", [experimentId])[0];
    if (!row) return null;
    return {
      id: String(row.id),
      world_id: String(row.world_id ?? DEFAULT_PHYSICAL_WORLD_ID),
      name: String(row.name),
      status: String(row.status),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      metadata: JSON.parse(String(row.metadata_json)) as JsonObject
    };
  }

  createSession(experimentId: string, model = "gpt-5.5"): AgentSession {
    const experiment = this.getExperiment(experimentId);
    if (!experiment) throw new Error(`Unknown experiment_id: ${experimentId}`);
    const created = now();
    const session: AgentSession = {
      id: id("sess"),
      experiment_id: experimentId,
      world_id: experiment.world_id,
      model,
      status: "active",
      created_at: created,
      updated_at: created
    };
    this.run("insert into agent_sessions values (?, ?, ?, ?, ?, ?, ?)", [
      session.id,
      session.experiment_id,
      session.world_id,
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
      world_id: String(row.world_id ?? DEFAULT_PHYSICAL_WORLD_ID),
      model: String(row.model),
      status: String(row.status),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at)
    }));
  }

  createWorld(input: { name: string; type: WorldType; metadata?: JsonObject }): World {
    if (input.type !== "physical" && input.type !== "virtual") throw new Error("World type must be physical or virtual.");
    const created = now();
    const world: World = {
      id: id("world"),
      name: input.name.trim() || (input.type === "physical" ? "Physical world" : "Virtual world"),
      type: input.type,
      status: "active",
      default_robot_id: null,
      created_at: created,
      updated_at: created,
      metadata: input.metadata ?? {}
    };
    this.run("insert into worlds values (?, ?, ?, ?, ?, ?, ?, ?)", [
      world.id,
      world.name,
      world.type,
      world.status,
      world.default_robot_id,
      world.created_at,
      world.updated_at,
      JSON.stringify(world.metadata)
    ]);
    this.save();
    return world;
  }

  updateWorld(input: { worldId: string; name?: string; metadata?: JsonObject }): World {
    const current = this.getWorld(input.worldId);
    if (!current) throw new Error(`Unknown world_id: ${input.worldId}`);
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : current.name;
    const metadata = input.metadata ?? current.metadata;
    this.run("update worlds set name = ?, metadata_json = ?, updated_at = ? where id = ?", [
      name,
      JSON.stringify(metadata),
      now(),
      input.worldId
    ]);
    this.save();
    const updated = this.getWorld(input.worldId);
    if (!updated) throw new Error(`Unknown world_id: ${input.worldId}`);
    return updated;
  }

  listWorlds(): World[] {
    return this.query("select * from worlds order by type asc, created_at asc").map((row) => this.worldFromRow(row));
  }

  getWorld(worldId: string): World | null {
    const row = this.query("select * from worlds where id = ? limit 1", [worldId])[0];
    return row ? this.worldFromRow(row) : null;
  }

  deleteWorld(worldId: string): void {
    if (worldId === DEFAULT_PHYSICAL_WORLD_ID) throw new Error("The default physical world cannot be deleted.");
    const experimentCount = Number(this.query("select count(*) as count from experiments where world_id = ?", [worldId])[0]?.count ?? 0);
    if (experimentCount > 0) throw new Error("Cannot delete a world with experiments.");
    this.run("delete from robot_world_assignments where world_id = ?", [worldId]);
    this.run("delete from virtual_world_entities where world_id = ?", [worldId]);
    this.run("delete from worlds where id = ?", [worldId]);
    this.save();
  }

  assignRobotToWorld(input: {
    robotId: string;
    worldId: string;
    robotKind: RobotKind;
    port?: string | null;
    metadata?: JsonObject;
    makeDefault?: boolean;
  }): RobotWorldAssignment {
    const robotId = input.robotId.trim();
    if (!robotId) throw new Error("robot_id is required.");
    const world = this.getWorld(input.worldId);
    if (!world) throw new Error(`Unknown world_id: ${input.worldId}`);
    if (world.type !== input.robotKind) throw new Error(`${input.robotKind} robots can only be assigned to ${input.robotKind} worlds.`);
    const updated = now();
    const assignment: RobotWorldAssignment = {
      robot_id: robotId,
      world_id: input.worldId,
      robot_kind: input.robotKind,
      port: input.port ?? null,
      metadata: input.metadata ?? {},
      updated_at: updated
    };
    this.run(
      `insert or replace into robot_world_assignments (robot_id, world_id, robot_kind, port, metadata_json, updated_at)
       values (?, ?, ?, ?, ?, ?)`,
      [assignment.robot_id, assignment.world_id, assignment.robot_kind, assignment.port, JSON.stringify(assignment.metadata), assignment.updated_at]
    );
    if (input.makeDefault || !world.default_robot_id) this.setDefaultRobotForWorld(input.worldId, robotId);
    this.save();
    return assignment;
  }

  listRobotWorldAssignments(worldId?: string): RobotWorldAssignment[] {
    const rows = worldId
      ? this.query("select * from robot_world_assignments where world_id = ? order by updated_at desc", [worldId])
      : this.query("select * from robot_world_assignments order by updated_at desc");
    return rows.map((row) => ({
      robot_id: String(row.robot_id),
      world_id: String(row.world_id),
      robot_kind: String(row.robot_kind) as RobotKind,
      port: row.port == null ? null : String(row.port),
      metadata: JSON.parse(String(row.metadata_json)) as JsonObject,
      updated_at: String(row.updated_at)
    }));
  }

  setDefaultRobotForWorld(worldId: string, robotId: string | null): void {
    if (!this.getWorld(worldId)) throw new Error(`Unknown world_id: ${worldId}`);
    this.run("update worlds set default_robot_id = ?, updated_at = ? where id = ?", [robotId, now(), worldId]);
    this.save();
  }

  createVirtualEntity(input: {
    worldId: string;
    kind: VirtualEntityKind;
    name: string;
    pose?: JsonObject;
    spec?: JsonObject;
    collisionEnabled?: boolean;
  }): VirtualWorldEntity {
    if (!["arm", "camera", "light", "rigid_body"].includes(input.kind)) throw new Error("Unknown virtual entity kind.");
    const world = this.getWorld(input.worldId);
    if (!world) throw new Error(`Unknown world_id: ${input.worldId}`);
    if (world.type !== "virtual") throw new Error("Virtual entities can only be placed in virtual worlds.");
    const created = now();
    const entity: VirtualWorldEntity = {
      id: id(input.kind === "rigid_body" ? "body" : input.kind),
      world_id: input.worldId,
      kind: input.kind,
      name: input.name.trim() || input.kind,
      pose: input.pose ?? {},
      spec: input.spec ?? {},
      collision_enabled: input.collisionEnabled ?? input.kind !== "camera",
      created_at: created,
      updated_at: created
    };
    this.run("insert into virtual_world_entities values (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      entity.id,
      entity.world_id,
      entity.kind,
      entity.name,
      JSON.stringify(entity.pose),
      JSON.stringify(entity.spec),
      entity.collision_enabled ? 1 : 0,
      entity.created_at,
      entity.updated_at
    ]);
    this.save();
    return entity;
  }

  listVirtualEntities(worldId?: string): VirtualWorldEntity[] {
    const rows = worldId
      ? this.query("select * from virtual_world_entities where world_id = ? order by created_at asc", [worldId])
      : this.query("select * from virtual_world_entities order by created_at asc");
    return rows.map((row) => this.virtualEntityFromRow(row));
  }

  updateVirtualEntity(input: {
    entityId: string;
    name?: string;
    pose?: JsonObject;
    spec?: JsonObject;
    collisionEnabled?: boolean;
  }): VirtualWorldEntity {
    const current = this.query("select * from virtual_world_entities where id = ? limit 1", [input.entityId])[0];
    if (!current) throw new Error(`Unknown virtual entity id: ${input.entityId}`);
    const entity = this.virtualEntityFromRow(current);
    const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : entity.name;
    const pose = input.pose ?? entity.pose;
    const spec = input.spec ?? entity.spec;
    const collisionEnabled = input.collisionEnabled ?? entity.collision_enabled;
    this.run(
      "update virtual_world_entities set name = ?, pose_json = ?, spec_json = ?, collision_enabled = ?, updated_at = ? where id = ?",
      [name, JSON.stringify(pose), JSON.stringify(spec), collisionEnabled ? 1 : 0, now(), input.entityId]
    );
    this.save();
    const updated = this.query("select * from virtual_world_entities where id = ? limit 1", [input.entityId])[0];
    if (!updated) throw new Error(`Unknown virtual entity id: ${input.entityId}`);
    return this.virtualEntityFromRow(updated);
  }

  deleteVirtualEntity(entityId: string): void {
    const entity = this.query("select * from virtual_world_entities where id = ? limit 1", [entityId])[0];
    if (!entity) throw new Error(`Unknown virtual entity id: ${entityId}`);
    const robotId = String(entity.id);
    this.run("delete from virtual_world_entities where id = ?", [entityId]);
    this.run("delete from robot_world_assignments where robot_id = ?", [robotId]);
    this.save();
  }

  deleteRobotAssignment(robotId: string): void {
    const id = robotId.trim();
    if (!id) throw new Error("robot_id is required.");
    this.run("delete from robot_world_assignments where robot_id = ?", [id]);
    for (const world of this.listWorlds()) {
      if (world.default_robot_id === id) this.setDefaultRobotForWorld(world.id, null);
    }
    this.save();
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

  private migrateWorldColumns(): void {
    if (!this.hasColumn("experiments", "world_id")) {
      this.exec(`alter table experiments add column world_id text not null default '${DEFAULT_PHYSICAL_WORLD_ID}'`);
    }
    if (!this.hasColumn("agent_sessions", "world_id")) {
      this.exec(`alter table agent_sessions add column world_id text not null default '${DEFAULT_PHYSICAL_WORLD_ID}'`);
    }
  }

  private hasColumn(table: string, column: string): boolean {
    return this.query(`pragma table_info(${table})`).some((row) => row.name === column);
  }

  private ensureDefaultPhysicalWorld(): void {
    if (this.getWorld(DEFAULT_PHYSICAL_WORLD_ID)) return;
    const created = now();
    this.run("insert into worlds values (?, ?, ?, ?, ?, ?, ?, ?)", [
      DEFAULT_PHYSICAL_WORLD_ID,
      "Default physical world",
      "physical",
      "active",
      null,
      created,
      created,
      JSON.stringify({ default: true })
    ]);
  }

  private worldFromRow(row: Record<string, unknown>): World {
    return {
      id: String(row.id),
      name: String(row.name),
      type: String(row.type) as WorldType,
      status: String(row.status),
      default_robot_id: row.default_robot_id == null ? null : String(row.default_robot_id),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      metadata: JSON.parse(String(row.metadata_json)) as JsonObject
    };
  }

  private virtualEntityFromRow(row: Record<string, unknown>): VirtualWorldEntity {
    return {
      id: String(row.id),
      world_id: String(row.world_id),
      kind: String(row.kind) as VirtualEntityKind,
      name: String(row.name),
      pose: JSON.parse(String(row.pose_json)) as JsonObject,
      spec: JSON.parse(String(row.spec_json)) as JsonObject,
      collision_enabled: Number(row.collision_enabled) === 1,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at)
    };
  }
}
