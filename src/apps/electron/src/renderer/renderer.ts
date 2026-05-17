type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export {};

declare global {
  interface Window {
    chem0: {
      listTools: () => Promise<JsonObject>;
      readResource: (uri: string) => Promise<JsonObject>;
      readUrdf: () => Promise<JsonObject>;
      callTool: (name: string, args?: JsonObject) => Promise<JsonObject>;
      createExperiment: (name: string, metadata?: JsonObject, worldId?: string) => Promise<JsonObject>;
      listExperiments: () => Promise<JsonObject>;
      listEvents: (experimentId: string) => Promise<JsonObject>;
      listArtifacts: (experimentId: string) => Promise<JsonObject>;
      sendAgentMessage: (input: JsonObject) => Promise<JsonObject>;
      openCalibrationWindow: () => Promise<JsonObject>;
      openRecordWindow: () => Promise<JsonObject>;
      openTrainWindow: () => Promise<JsonObject>;
      openReplayWindow: () => Promise<JsonObject>;
      openSettingsWindow: () => Promise<JsonObject>;
      openWorkbenchWindow: (tab?: string) => Promise<JsonObject>;
      detachWorkbenchTab: (tab: string) => Promise<JsonObject>;
      onWorkbenchSetTab: (callback: (payload: { tab: string }) => void) => () => void;
      platform: string;
      getSettings: () => Promise<JsonObject>;
      setSetting: (key: string, value: unknown) => Promise<JsonObject>;
      onSettingsChanged: (callback: (settings: JsonObject) => void) => () => void;
      onAgentEvent: (callback: (event: JsonObject) => void) => () => void;
    };
  }
}

document.body.classList.add(`platform-${window.chem0?.platform ?? "darwin"}`);

const output = document.querySelector<HTMLPreElement>("#output")!;
const experimentSelect = document.querySelector<HTMLSelectElement>("#experiment")!;
const experimentName = document.querySelector<HTMLInputElement>("#experiment-name")!;
const experimentsList = document.querySelector<HTMLUListElement>("#experiments-list")!;
const robotsList = document.querySelector<HTMLUListElement>("#robots-list")!;
const worldsList = document.querySelector<HTMLUListElement>("#worlds-list")!;
const artifactsList = document.querySelector<HTMLUListElement>("#artifacts-list")!;
const experimentMeta = document.querySelector<HTMLPreElement>("#experiment-meta")!;
const experimentNotes = document.querySelector<HTMLTextAreaElement>("#experiment-notes")!;
const defaultRobotInput = document.querySelector<HTMLInputElement>("#default-robot")!;
const worldSelect = document.querySelector<HTMLSelectElement>("#world-select")!;
const newWorldMenuBtn = document.querySelector<HTMLButtonElement>("#new-world-menu")!;
const newWorldOptions = document.querySelector<HTMLDivElement>("#new-world-options")!;
const worldModal = document.querySelector<HTMLDivElement>("#world-modal")!;
const worldModalTitle = document.querySelector<HTMLHeadingElement>("#world-modal-title")!;
const worldModalKind = document.querySelector<HTMLSpanElement>("#world-modal-kind")!;
const worldModalName = document.querySelector<HTMLInputElement>("#world-modal-name")!;
const worldModalNotes = document.querySelector<HTMLTextAreaElement>("#world-modal-notes")!;
const worldModalCancel = document.querySelector<HTMLButtonElement>("#world-modal-cancel")!;
const worldModalCreate = document.querySelector<HTMLButtonElement>("#world-modal-create")!;
const refreshWorldsBtn = document.querySelector<HTMLButtonElement>("#refresh-worlds")!;
const virtualArmNameInput = document.querySelector<HTMLInputElement>("#virtual-arm-name")!;
const createVirtualArmBtn = document.querySelector<HTMLButtonElement>("#create-virtual-arm")!;
const setDefaultRobot = document.querySelector<HTMLButtonElement>("#set-default-robot")!;
const refreshRobotsBtn = document.querySelector<HTMLButtonElement>("#refresh-robots")!;
const refreshArtifactsBtn = document.querySelector<HTMLButtonElement>("#refresh-artifacts")!;
const activeExperiment = document.querySelector<HTMLDivElement>("#active-experiment")!;
const activeExperimentText = activeExperiment.querySelector<HTMLSpanElement>(".status-text") ?? activeExperiment;
const chatLog = document.querySelector<HTMLDivElement>("#chat-log")!;
const chatInput = document.querySelector<HTMLTextAreaElement>("#chat-input")!;
const sendMessage = document.querySelector<HTMLButtonElement>("#send-message")!;
const recordAudio = document.querySelector<HTMLButtonElement>("#record-audio")!;
const phCanvas = document.querySelector<HTMLCanvasElement>("#ph-canvas");
const workspace = document.querySelector<HTMLDivElement>(".workspace")!;
const lhsSidebar = document.querySelector<HTMLElement>("#sidebar-lhs")!;
const rhsSidebar = document.querySelector<HTMLElement>("#sidebar-rhs")!;
const toggleLhsBtn = document.querySelector<HTMLButtonElement>("#toggle-lhs")!;
const toggleRhsBtn = document.querySelector<HTMLButtonElement>("#toggle-rhs")!;
const openSettingsBtn = document.querySelector<HTMLButtonElement>("#open-settings")!;
const camVideos: (HTMLVideoElement | null)[] = [
  document.querySelector<HTMLVideoElement>("#cam-0"),
  document.querySelector<HTMLVideoElement>("#cam-1"),
  document.querySelector<HTMLVideoElement>("#cam-2"),
];
const camStreams: (MediaStream | null)[] = [null, null, null];

let experimentId = "";
let sessionId = "";
let defaultRobotId = "";
let selectedWorldId = "world_physical_default";
let assistantBubble: HTMLDivElement | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let experimentsCache: JsonObject[] = [];
let worldsCache: JsonObject[] = [];
let assignmentsCache: JsonObject[] = [];
let virtualEntitiesCache: JsonObject[] = [];
let worldModalMode: "create" | "edit" = "create";
let worldModalType: "physical" | "virtual" = "physical";
let worldModalWorldId = "";

type PhSample = { value: number; timestamp: number };
const phSamples: PhSample[] = [];

function setActiveExperimentLabel(text: string, active: boolean): void {
  activeExperimentText.textContent = text;
  activeExperiment.classList.toggle("active", active);
}

function show(value: unknown): void {
  output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function withExperiment(args: JsonObject = {}): JsonObject {
  const next: JsonObject = { ...args };
  if (experimentId) next.experiment_id = experimentId;
  if (defaultRobotId && !next.robot_id) next.robot_id = defaultRobotId;
  return next;
}

function setActive(experiment: JsonObject, session?: JsonObject): void {
  experimentId = String(experiment.id ?? "");
  sessionId = String(session?.id ?? sessionId);
  selectedWorldId = String(experiment.world_id ?? selectedWorldId);
  worldSelect.value = selectedWorldId;
  syncSelectedWorldState();
  setActiveExperimentLabel(
    experimentId ? `${String(experiment.name ?? "Experiment")} · ${experimentId}` : "No experiment",
    Boolean(experimentId)
  );
  updateExperimentsListSelection();
  updateNotesPane();
}

function appendChat(role: string, text: string): HTMLDivElement {
  const item = document.createElement("div");
  item.className = `chat-item ${role}`;
  const label = document.createElement("div");
  label.className = "chat-role";
  label.textContent = role;
  const body = document.createElement("div");
  body.className = "chat-body";
  body.textContent = text;
  item.append(label, body);
  chatLog.append(item);
  chatLog.scrollTop = chatLog.scrollHeight;
  return body;
}

function imagesFromContent(content: unknown): Array<{ data: string; mimeType: string }> {
  if (!Array.isArray(content)) return [];
  const images: Array<{ data: string; mimeType: string }> = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const c = item as JsonObject;
    if (c.type === "image" && typeof c.data === "string" && typeof c.mimeType === "string") {
      images.push({ data: c.data, mimeType: c.mimeType });
    }
  }
  return images;
}

function appendToolBubble(name: string, result: JsonObject | undefined): void {
  const body = appendChat("tool", `${name} response`);
  if (!result) return;
  for (const img of imagesFromContent(result.content)) {
    const el = document.createElement("img");
    el.src = `data:${img.mimeType};base64,${img.data}`;
    el.className = "tool-image";
    body.parentElement?.appendChild(el);
  }
}

function drawPhChart(): void {
  if (!phCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = phCanvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  phCanvas.width = Math.floor(rect.width * dpr);
  phCanvas.height = Math.floor(rect.height * dpr);
  const ctx = phCanvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const padLeft = 32;
  const padBottom = 18;
  const padTop = 10;
  const padRight = 12;
  const innerW = Math.max(1, w - padLeft - padRight);
  const innerH = Math.max(1, h - padTop - padBottom);

  ctx.font = "11px Inter, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";

  for (const ph of [0, 7, 14]) {
    const y = padTop + innerH - (ph / 14) * innerH;
    ctx.strokeStyle = "#1c2029";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + innerW, y);
    ctx.stroke();
    ctx.fillStyle = "#7a8290";
    ctx.fillText(String(ph), padLeft - 6, y);
  }

  ctx.strokeStyle = "#262c37";
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, padTop + innerH);
  ctx.lineTo(padLeft + innerW, padTop + innerH);
  ctx.stroke();

  if (phSamples.length === 0) {
    ctx.fillStyle = "#444";
    ctx.textAlign = "center";
    ctx.fillText("waiting for record_ph samples…", padLeft + innerW / 2, padTop + innerH / 2);
    return;
  }

  const tMin = phSamples[0].timestamp;
  const tMax = phSamples[phSamples.length - 1].timestamp;
  const tSpan = Math.max(1, tMax - tMin);

  const xFor = (t: number) =>
    phSamples.length === 1 ? padLeft + innerW / 2 : padLeft + ((t - tMin) / tSpan) * innerW;
  const yFor = (v: number) => padTop + innerH - (Math.max(0, Math.min(14, v)) / 14) * innerH;

  ctx.strokeStyle = "#6ee7c8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  phSamples.forEach((sample, i) => {
    const x = xFor(sample.timestamp);
    const y = yFor(sample.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#6ee7c8";
  for (const sample of phSamples) {
    const x = xFor(sample.timestamp);
    const y = yFor(sample.value);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderEvents(events: JsonObject[]): void {
  chatLog.replaceChildren();
  phSamples.length = 0;
  for (const event of events) {
    const type = String(event.type ?? "");
    const role = String(event.role ?? "system");
    const content = (event.content ?? {}) as JsonObject;
    if (type === "message" && role !== "system") appendChat(role, String(content.text ?? ""));
    if (type === "tool_call") appendChat("tool", `${String(event.name ?? "tool")} ${JSON.stringify(content)}`);
    if (type === "tool_response") appendToolBubble(String(event.name ?? "tool"), content);
    if (type === "error") appendChat("error", String(content.message ?? content.text ?? ""));
    if (type === "ph_sample") {
      const v = Number(content.value);
      const t = Number(content.timestamp);
      if (Number.isFinite(v) && Number.isFinite(t)) phSamples.push({ value: v, timestamp: t });
    }
  }
  drawPhChart();
}

function renderExperimentsList(): void {
  experimentsList.replaceChildren();
  if (experimentsCache.length === 0) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "No experiments yet. Create one above.";
    experimentsList.append(empty);
    return;
  }
  for (const experiment of experimentsCache) {
    const id = String(experiment.id);
    const li = document.createElement("li");
    li.className = "list-item";
    li.dataset.experimentId = id;
    if (id === experimentId) li.classList.add("active");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = String(experiment.name ?? "Untitled");
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = id;
    li.append(title, sub);
    li.addEventListener("click", () => {
      if (id === experimentId) return;
      setActive(experiment);
      void loadEvents();
      void refreshArtifacts();
    });
    experimentsList.append(li);
  }
}

function selectedWorld(): JsonObject | undefined {
  return worldsCache.find((world) => String(world.id) === selectedWorldId);
}

function syncSelectedWorldState(): void {
  const world = selectedWorld();
  defaultRobotId = typeof world?.default_robot_id === "string" ? world.default_robot_id : "";
  defaultRobotInput.value = defaultRobotId;
  worldSelect.value = selectedWorldId;
  const isVirtual = world?.type === "virtual";
  createVirtualArmBtn.disabled = !isVirtual;
  for (const li of worldsList.querySelectorAll<HTMLLIElement>(".list-item")) {
    li.classList.toggle("active", li.dataset.worldId === selectedWorldId);
  }
}

function worldAssignments(worldId: string): JsonObject[] {
  return assignmentsCache.filter((item) => String(item.world_id) === worldId);
}

function worldEntities(worldId: string): JsonObject[] {
  return virtualEntitiesCache.filter((entity) => String(entity.world_id) === worldId);
}

async function createVirtualCameraInWorld(worldId: string): Promise<void> {
  const result = await window.chem0.callTool("create_virtual_camera", {
    world_id: worldId,
    name: `Camera ${worldEntities(worldId).filter((entity) => entity.kind === "camera").length + 1}`,
    pose: { x: 0.35, y: -0.35, z: 0.45, roll: 0, pitch: -35, yaw: 45 },
    spec: { resolution: "1280x720", fov_degrees: 60 }
  });
  show(result);
  await refreshWorlds();
}

async function createVirtualRigidBodyInWorld(worldId: string): Promise<void> {
  const result = await window.chem0.callTool("create_virtual_rigid_body", {
    world_id: worldId,
    name: `Object ${worldEntities(worldId).filter((entity) => entity.kind === "rigid_body").length + 1}`,
    pose: { x: 0.18, y: 0, z: 0.03, roll: 0, pitch: 0, yaw: 0 },
    spec: {
      mass_kg: 0.1,
      collision_shape: "box",
      dimensions_m: [0.05, 0.05, 0.05],
      collision_mode: "full",
      collides_with: ["arm", "rigid_body"]
    },
    collision_enabled: true
  });
  show(result);
  await refreshWorlds();
}

function appendWorldContents(li: HTMLLIElement, world: JsonObject): void {
  if (String(world.id) !== selectedWorldId) return;
  const worldId = String(world.id);
  const expanded = document.createElement("div");
  expanded.className = "world-expanded";
  const assignments = worldAssignments(worldId);
  const entities = worldEntities(worldId);

  const sections: Array<{ label: string; items: string[]; action?: { label: string; run: () => void } }> = [
    {
      label: "arms",
      items: assignments.map((item) => `${String(item.robot_id)} · ${String(item.robot_kind)}`)
    }
  ];
  if (world.type === "virtual") {
    sections.push({
      label: "cameras",
      items: entities.filter((entity) => entity.kind === "camera").map((entity) => String(entity.name ?? entity.id)),
      action: { label: "+ Cam", run: () => void createVirtualCameraInWorld(worldId) }
    });
    sections.push({
      label: "objects",
      items: entities
        .filter((entity) => entity.kind === "rigid_body")
        .map((entity) => `${String(entity.name ?? entity.id)} · ${entity.collision_enabled ? "collision" : "passive"}`),
      action: { label: "+ Object", run: () => void createVirtualRigidBodyInWorld(worldId) }
    });
  }

  for (const section of sections) {
    const block = document.createElement("div");
    block.className = "world-section";
    const head = document.createElement("div");
    head.className = "world-section-head";
    const label = document.createElement("div");
    label.className = "world-section-label";
    label.textContent = section.label;
    head.append(label);
    if (section.action) {
      const action = document.createElement("button");
      action.className = "ghost mini";
      action.textContent = section.action.label;
      action.addEventListener("click", (event) => {
        event.stopPropagation();
        section.action?.run();
      });
      head.append(action);
    }
    block.append(head);
    if (section.items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "world-section-empty";
      empty.textContent = "none";
      block.append(empty);
    } else {
      for (const item of section.items) {
        const row = document.createElement("div");
        row.className = "world-section-row";
        row.textContent = item;
        block.append(row);
      }
    }
    expanded.append(block);
  }

  const actions = document.createElement("div");
  actions.className = "world-actions";
  const edit = document.createElement("button");
  edit.className = "ghost mini";
  edit.textContent = "Edit";
  edit.addEventListener("click", (event) => {
    event.stopPropagation();
    openWorldModal("edit", String(world.type) === "virtual" ? "virtual" : "physical", world);
  });
  const del = document.createElement("button");
  del.className = "ghost mini";
  del.textContent = "Delete";
  del.disabled = worldId === "world_physical_default";
  del.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (del.disabled) return;
    try {
      show(await window.chem0.callTool("delete_world", { world_id: worldId }));
      selectedWorldId = "world_physical_default";
      await refreshWorlds();
      void refreshRobots();
    } catch (error) {
      show({ delete_world_error: error instanceof Error ? error.message : String(error) });
    }
  });
  actions.append(edit, del);
  expanded.append(actions);
  li.append(expanded);
}

function renderWorldsList(): void {
  worldsList.replaceChildren();
  worldSelect.replaceChildren();
  if (worldsCache.length === 0) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "No worlds found.";
    worldsList.append(empty);
    return;
  }
  for (const world of worldsCache) {
    const id = String(world.id);
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${String(world.name ?? id)} · ${String(world.type ?? "world")}`;
    worldSelect.append(option);

    const li = document.createElement("li");
    li.className = "list-item";
    li.dataset.worldId = id;
    if (id === selectedWorldId) li.classList.add("active");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = String(world.name ?? id);
    const sub = document.createElement("div");
    sub.className = "sub";
    const defaultRobot = world.default_robot_id ? `default ${String(world.default_robot_id)}` : "no default arm";
    sub.textContent = `${String(world.type ?? "world")} · ${defaultRobot}`;
    li.append(title, sub);
    appendWorldContents(li, world);
    li.addEventListener("click", () => {
      selectedWorldId = id;
      syncSelectedWorldState();
      renderWorldsList();
      void refreshRobots();
    });
    worldsList.append(li);
  }
  syncSelectedWorldState();
}

async function refreshWorlds(): Promise<void> {
  const result = await window.chem0.callTool("list_worlds", {});
  worldsCache = (result.worlds ?? []) as JsonObject[];
  assignmentsCache = (result.assignments ?? []) as JsonObject[];
  virtualEntitiesCache = (result.virtual_entities ?? []) as JsonObject[];
  if (!worldsCache.some((world) => String(world.id) === selectedWorldId)) {
    selectedWorldId = String(worldsCache[0]?.id ?? "world_physical_default");
  }
  renderWorldsList();
}

function updateExperimentsListSelection(): void {
  for (const li of experimentsList.querySelectorAll<HTMLLIElement>(".list-item")) {
    li.classList.toggle("active", li.dataset.experimentId === experimentId);
  }
}

function updateNotesPane(): void {
  if (!experimentId) {
    experimentMeta.textContent = "No experiment selected";
    experimentNotes.value = "";
    experimentNotes.disabled = true;
    return;
  }
  const experiment = experimentsCache.find((e) => String(e.id) === experimentId);
  experimentMeta.textContent = experiment
    ? JSON.stringify(experiment, null, 2)
    : `id: ${experimentId}`;
  experimentNotes.disabled = false;
  experimentNotes.value = localStorage.getItem(`chem0:notes:${experimentId}`) ?? "";
}

experimentNotes.addEventListener("input", () => {
  if (!experimentId) return;
  localStorage.setItem(`chem0:notes:${experimentId}`, experimentNotes.value);
});

async function refreshExperiments(): Promise<void> {
  const result = await window.chem0.listExperiments();
  const experiments = (result.experiments ?? []) as JsonObject[];
  experimentsCache = experiments;
  experimentSelect.replaceChildren();
  for (const experiment of experiments) {
    const option = document.createElement("option");
    option.value = String(experiment.id);
    option.textContent = `${String(experiment.name)} · ${String(experiment.id)}`;
    experimentSelect.append(option);
  }
  if (!experimentId && experiments[0]) setActive(experiments[0]);
  if (experimentId) experimentSelect.value = experimentId;
  renderExperimentsList();
  updateNotesPane();
}

async function refreshArtifacts(): Promise<void> {
  artifactsList.replaceChildren();
  if (!experimentId) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "Select an experiment to see its artifacts.";
    artifactsList.append(empty);
    return;
  }
  try {
    const result = await window.chem0.listArtifacts(experimentId);
    const artifacts = (result.artifacts ?? []) as JsonObject[];
    if (artifacts.length === 0) {
      const empty = document.createElement("li");
      empty.className = "list-empty";
      empty.textContent = "No artifacts for this experiment yet.";
      artifactsList.append(empty);
      return;
    }
    for (const artifact of artifacts) {
      const li = document.createElement("li");
      li.className = "list-item";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = String(artifact.name ?? artifact.id ?? "artifact");
      const sub = document.createElement("div");
      sub.className = "sub";
      const kind = artifact.kind ?? artifact.mime_type ?? "";
      const size = artifact.size_bytes ?? artifact.size ?? "";
      sub.textContent = [kind, size].filter(Boolean).join(" · ") || String(artifact.id ?? "");
      li.append(title, sub);
      artifactsList.append(li);
    }
  } catch (error) {
    const li = document.createElement("li");
    li.className = "list-empty";
    li.textContent = `Failed to load artifacts: ${error instanceof Error ? error.message : String(error)}`;
    artifactsList.append(li);
  }
}

function textFromTool(result: JsonObject): string {
  const content = result.content;
  if (!Array.isArray(content)) return JSON.stringify(result);
  const first = content[0] as JsonObject | undefined;
  return typeof first?.text === "string" ? (first.text as string) : JSON.stringify(result);
}

async function refreshRobots(): Promise<void> {
  robotsList.replaceChildren();
  try {
    const result = await window.chem0.callTool("list_connected_robots", { max_id: 12 });
    await refreshWorlds();
    let parsed: JsonObject = {};
    try { parsed = JSON.parse(textFromTool(result)) as JsonObject; } catch { parsed = result; }
    const robots = (parsed.robots ?? []) as JsonObject[];
    const assignedOnly = assignmentsCache.filter((item) => String(item.world_id) === selectedWorldId);
    if ((!Array.isArray(robots) || robots.length === 0) && assignedOnly.length === 0) {
      const empty = document.createElement("li");
      empty.className = "list-empty";
      empty.textContent = "No arms detected or assigned. Type a virtual arm id above for virtual worlds.";
      robotsList.append(empty);
      return;
    }
    const renderedRobotIds = new Set<string>();
    for (const robot of robots) {
      const li = document.createElement("li");
      li.className = "list-item";
      const robotId = String(robot.suggested_robot_id ?? robot.robot_id ?? "so101");
      renderedRobotIds.add(robotId);
      const assignment = assignmentsCache.find((item) => String(item.robot_id) === robotId);
      const assignedWorldId = String(assignment?.world_id ?? "world_physical_default");
      if (robotId === defaultRobotId) li.classList.add("active");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = robotId;
      const sub = document.createElement("div");
      sub.className = "sub";
      const worldName = worldsCache.find((world) => String(world.id) === assignedWorldId)?.name ?? assignedWorldId;
      sub.textContent = `${String(robot.port ?? "?")} · ${robot.looks_like_so101 ? "so101" : "unknown"} · ${String(worldName)}`;
      li.append(title, sub);
      li.addEventListener("click", () => {
        defaultRobotInput.value = robotId;
        void assignRobotToSelectedWorld(robot, true);
      });
      robotsList.append(li);
    }
    for (const assignment of assignedOnly) {
      const robotId = String(assignment.robot_id ?? "");
      if (!robotId || renderedRobotIds.has(robotId)) continue;
      const li = document.createElement("li");
      li.className = "list-item";
      if (robotId === defaultRobotId) li.classList.add("active");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = robotId;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = `${String(assignment.robot_kind ?? "robot")} · assigned`;
      li.append(title, sub);
      li.addEventListener("click", () => {
        defaultRobotInput.value = robotId;
        void applyDefaultRobot(robotId);
      });
      robotsList.append(li);
    }
  } catch (error) {
    const li = document.createElement("li");
    li.className = "list-empty";
    li.textContent = `Failed to scan: ${error instanceof Error ? error.message : String(error)}`;
    robotsList.append(li);
  }
}

async function assignRobotToSelectedWorld(robot: JsonObject, makeDefault: boolean): Promise<void> {
  const robotId = String(robot.suggested_robot_id ?? robot.robot_id ?? defaultRobotInput.value).trim();
  if (!robotId) return;
  try {
    const result = await window.chem0.callTool("assign_robot_to_world", {
      robot_id: robotId,
      world_id: selectedWorldId,
      robot_kind: "physical",
      port: typeof robot.port === "string" ? robot.port : null,
      make_default: makeDefault,
      metadata: {
        looks_like_so101: robot.looks_like_so101 === true,
        servo_ids: Array.isArray(robot.servo_ids) ? robot.servo_ids : []
      }
    });
    show(result);
    await refreshWorlds();
    void refreshRobots();
  } catch (error) {
    show({ assign_robot_error: error instanceof Error ? error.message : String(error) });
  }
}

async function applyDefaultRobot(robotId: string): Promise<void> {
  const world = selectedWorld();
  const worldType = String(world?.type ?? "physical");
  await window.chem0.callTool("assign_robot_to_world", {
    robot_id: robotId,
    world_id: selectedWorldId,
    robot_kind: worldType === "virtual" ? "virtual" : "physical",
    make_default: true,
    metadata: { source: "manual" }
  });
  const result = await window.chem0.callTool("set_default_robot", { robot_id: robotId, world_id: selectedWorldId });
  defaultRobotId = String(result.robot_id ?? robotId);
  defaultRobotInput.value = defaultRobotId;
  show(result);
  await refreshWorlds();
  void refreshRobots();
}

async function createVirtualArm(): Promise<void> {
  if (selectedWorld()?.type !== "virtual") {
    show("Select a virtual world before creating a virtual arm.");
    return;
  }
  const result = await window.chem0.callTool("create_virtual_arm", {
    world_id: selectedWorldId,
    name: virtualArmNameInput.value.trim() || "Virtual SO-101",
    make_default: true,
    pose: { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 },
    spec: { model: "so101", collision_mode: "full", collides_with: ["rigid_body"] }
  });
  virtualArmNameInput.value = "";
  show(result);
  await refreshWorlds();
  void refreshRobots();
}

function openWorldModal(mode: "create" | "edit", type: "physical" | "virtual", world?: JsonObject): void {
  worldModalMode = mode;
  worldModalType = type;
  worldModalWorldId = world ? String(world.id ?? "") : "";
  worldModalTitle.textContent = mode === "edit" ? "Edit world" : "New world";
  worldModalKind.textContent = type;
  worldModalCreate.textContent = mode === "edit" ? "Save" : "Create";
  worldModalName.value = String(world?.name ?? (type === "virtual" ? "Virtual world" : "Physical world"));
  const metadata = (world?.metadata ?? {}) as JsonObject;
  worldModalNotes.value = typeof metadata.notes === "string" ? metadata.notes : "";
  worldModal.hidden = false;
  worldModalName.focus();
  worldModalName.select();
}

function closeWorldModal(): void {
  worldModal.hidden = true;
  worldModalWorldId = "";
}

async function submitWorldModal(): Promise<void> {
  const name = worldModalName.value.trim() || (worldModalType === "virtual" ? "Virtual world" : "Physical world");
  const metadata: JsonObject = {};
  if (worldModalNotes.value.trim()) metadata.notes = worldModalNotes.value.trim();
  if (worldModalMode === "create") {
    const result = await window.chem0.callTool("create_world", { name, type: worldModalType, metadata });
    const world = result.world as JsonObject | undefined;
    if (world?.id) selectedWorldId = String(world.id);
    show(result);
  } else {
    const result = await window.chem0.callTool("update_world", { world_id: worldModalWorldId, name, metadata });
    show(result);
  }
  closeWorldModal();
  await refreshWorlds();
  void refreshRobots();
}

async function loadEvents(): Promise<void> {
  if (!experimentId) {
    phSamples.length = 0;
    drawPhChart();
    return;
  }
  const result = await window.chem0.listEvents(experimentId);
  renderEvents((result.events ?? []) as JsonObject[]);
  show(result);
}

async function call(name: string, args: JsonObject = {}): Promise<JsonObject> {
  const result = await window.chem0.callTool(name, withExperiment(args));
  show(result);
  return result;
}

function updateCameraVisibility(activeIds: Set<number>): void {
  for (let i = 0; i < camVideos.length; i++) {
    const cell = camVideos[i]?.closest(".camera-cell") as HTMLElement | null;
    if (!cell) continue;
    cell.classList.toggle("hidden", !activeIds.has(i));
  }
}

function setCameraLabel(slot: number, label: string): void {
  const cell = camVideos[slot]?.closest(".camera-cell") as HTMLElement | null;
  const labelEl = cell?.querySelector(".camera-label") as HTMLElement | null;
  if (labelEl) labelEl.textContent = label;
}

function isLikelyContinuityCamera(label: string): boolean {
  const lower = label.toLowerCase();
  return lower.includes("iphone") || lower.includes("ipad") || lower.includes("continuity");
}

async function initBrowserCameras(): Promise<void> {
  const active = new Set<number>();
  try {
    const probeStream = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of probeStream.getTracks()) track.stop();

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices
      .filter((d) => d.kind === "videoinput")
      .filter((d) => !isLikelyContinuityCamera(d.label));

    for (let i = 0; i < camVideos.length; i++) {
      const video = camVideos[i];
      const device = videoDevices[i];
      if (!video || !device) continue;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: device.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });
        video.srcObject = stream;
        camStreams[i] = stream;
        setCameraLabel(i, device.label ? device.label.slice(0, 28) : `cam ${i}`);
        active.add(i);
      } catch (error) {
        console.error(`Failed to open camera slot ${i}`, error);
      }
    }
  } catch (error) {
    console.error("Camera permission denied or unavailable", error);
  }
  updateCameraVisibility(active);
}

window.addEventListener("beforeunload", () => {
  for (const stream of camStreams) {
    if (!stream) continue;
    for (const track of stream.getTracks()) track.stop();
  }
});

/* ------------------------- tabs & sidebars ------------------------- */

const SIDEBAR_TABS: Record<"lhs" | "rhs", string> = {
  lhs: "lhs:experiments",
  rhs: "rhs:chat"
};

function activateTab(tab: string): void {
  const [side] = tab.split(":") as ["lhs" | "rhs"];
  if (side !== "lhs" && side !== "rhs") return;
  SIDEBAR_TABS[side] = tab;
  const sidebar = side === "lhs" ? lhsSidebar : rhsSidebar;
  for (const pane of sidebar.querySelectorAll<HTMLElement>(".sidebar-pane")) {
    pane.classList.toggle("active", pane.dataset.tab === tab);
  }
  for (const btn of document.querySelectorAll<HTMLButtonElement>(`.tab-btn[data-tab^="${side}:"]`)) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
  if (!workspace.classList.contains(`${side}-collapsed`)) return;
  workspace.classList.remove(`${side}-collapsed`);
  updateToggleButtonStates();
}

function updateToggleButtonStates(): void {
  toggleLhsBtn.classList.toggle("active", !workspace.classList.contains("lhs-collapsed"));
  toggleRhsBtn.classList.toggle("active", !workspace.classList.contains("rhs-collapsed"));
}

toggleLhsBtn.addEventListener("click", () => {
  workspace.classList.toggle("lhs-collapsed");
  updateToggleButtonStates();
  drawPhChart();
});
toggleRhsBtn.addEventListener("click", () => {
  workspace.classList.toggle("rhs-collapsed");
  updateToggleButtonStates();
  drawPhChart();
});

for (const btn of document.querySelectorAll<HTMLButtonElement>(".tab-btn")) {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab) activateTab(tab);
  });
}

activateTab(SIDEBAR_TABS.lhs);
activateTab(SIDEBAR_TABS.rhs);
updateToggleButtonStates();

/* --------------------------- boot & actions --------------------------- */

async function boot(): Promise<void> {
  const [tools] = await Promise.all([window.chem0.listTools(), refreshWorlds()]);
  await refreshExperiments();
  const defaultRobot = await window.chem0.callTool("get_default_robot", { world_id: selectedWorldId });
  defaultRobotId = typeof defaultRobot.robot_id === "string" ? defaultRobot.robot_id : "";
  defaultRobotInput.value = defaultRobotId;
  show(tools);
  await loadEvents();
  void refreshArtifacts();
  void refreshRobots();
  void initBrowserCameras();
  setInterval(() => void refreshRobots(), 8000);
}

document.querySelector("#create-experiment")?.addEventListener("click", async () => {
  try {
    const result = await window.chem0.createExperiment(
      experimentName.value.trim() || "Untitled experiment",
      { app: "electron" },
      selectedWorldId
    );
    show(result);
    setActive(result.experiment as JsonObject, result.session as JsonObject);
    await refreshExperiments();
    await loadEvents();
    void refreshArtifacts();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    show({ create_experiment_error: message });
    appendChat("error", `create_experiment failed: ${message}`);
  }
});

worldSelect.addEventListener("change", () => {
  selectedWorldId = worldSelect.value;
  syncSelectedWorldState();
  void refreshRobots();
});
refreshWorldsBtn.addEventListener("click", async () => {
  await refreshWorlds();
  void refreshRobots();
});

newWorldMenuBtn.addEventListener("click", () => {
  newWorldOptions.hidden = !newWorldOptions.hidden;
});
for (const btn of newWorldOptions.querySelectorAll<HTMLButtonElement>("button[data-world-type]")) {
  btn.addEventListener("click", () => {
    const type = btn.dataset.worldType === "virtual" ? "virtual" : "physical";
    newWorldOptions.hidden = true;
    openWorldModal("create", type);
  });
}
document.addEventListener("click", (event) => {
  const target = event.target as Node | null;
  if (!target || newWorldOptions.hidden) return;
  if (newWorldOptions.contains(target) || newWorldMenuBtn.contains(target)) return;
  newWorldOptions.hidden = true;
});
worldModalCancel.addEventListener("click", closeWorldModal);
worldModalCreate.addEventListener("click", () => void submitWorldModal());
worldModal.addEventListener("click", (event) => {
  if (event.target === worldModal) closeWorldModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !worldModal.hidden) closeWorldModal();
});

createVirtualArmBtn.addEventListener("click", () => void createVirtualArm());

experimentSelect.addEventListener("change", async () => {
  experimentId = experimentSelect.value;
  sessionId = "";
  const experiment = experimentsCache.find((item) => String(item.id) === experimentId);
  if (experiment) selectedWorldId = String(experiment.world_id ?? selectedWorldId);
  syncSelectedWorldState();
  setActiveExperimentLabel(experimentId || "No experiment", Boolean(experimentId));
  updateExperimentsListSelection();
  updateNotesPane();
  await loadEvents();
  void refreshArtifacts();
});

refreshRobotsBtn.addEventListener("click", () => void refreshRobots());
refreshArtifactsBtn.addEventListener("click", () => void refreshArtifacts());

document.querySelector("#open-record")?.addEventListener("click", async () => show(await window.chem0.openRecordWindow()));
document.querySelector("#open-train")?.addEventListener("click", async () => show(await window.chem0.openTrainWindow()));
document.querySelector("#open-replay")?.addEventListener("click", async () => show(await window.chem0.openReplayWindow()));
document.querySelector("#open-calibration")?.addEventListener("click", async () => show(await window.chem0.openCalibrationWindow()));
openSettingsBtn.addEventListener("click", async () => show(await window.chem0.openSettingsWindow()));
setDefaultRobot.addEventListener("click", async () => {
  const robotId = defaultRobotInput.value.trim();
  if (!robotId) {
    show("Enter a robot_id first.");
    return;
  }
  await applyDefaultRobot(robotId);
});

/* ---------- send / stop (single button that toggles) ---------- */

let inFlight = false;
let inFlightIdleTimer: ReturnType<typeof setTimeout> | null = null;
const IN_FLIGHT_IDLE_MS = 3000;

function setInFlight(value: boolean): void {
  inFlight = value;
  sendMessage.classList.toggle("in-flight", value);
  sendMessage.setAttribute("aria-label", value ? "Stop response" : "Send message");
  if (!value && inFlightIdleTimer) {
    clearTimeout(inFlightIdleTimer);
    inFlightIdleTimer = null;
  }
}

function bumpInFlightIdle(): void {
  if (!inFlight) return;
  if (inFlightIdleTimer) clearTimeout(inFlightIdleTimer);
  inFlightIdleTimer = setTimeout(() => setInFlight(false), IN_FLIGHT_IDLE_MS);
}

sendMessage.addEventListener("click", async () => {
  if (inFlight) {
    // Best-effort UI stop: backend cancellation isn't wired yet, so we just
    // release the in-flight state so the user can compose a new message.
    setInFlight(false);
    assistantBubble = null;
    return;
  }
  await sendToAgent(chatInput.value);
});

async function sendToAgent(raw: string): Promise<void> {
  const message = raw.trim();
  if (!message || !experimentId) return;
  chatInput.value = "";
  assistantBubble = null;
  setInFlight(true);
  bumpInFlightIdle();
  const payload: JsonObject = {
    experiment_id: experimentId,
    message,
    model: "gpt-5.5"
  };
  if (sessionId) payload.session_id = sessionId;
  await window.chem0.sendAgentMessage(payload);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/* ---------- record voice (single toggling button) ---------- */

async function startVoiceRecording(): Promise<void> {
  if (!experimentId) {
    show("Create or select an experiment before recording audio.");
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", () => {
    for (const track of stream.getTracks()) track.stop();
  });
  mediaRecorder.start();
  recordAudio.classList.add("recording");
  recordAudio.setAttribute("aria-label", "Stop recording");
  appendChat("system", "Recording human audio…");
}

async function stopVoiceRecording(): Promise<void> {
  if (!mediaRecorder) return;
  const recorder = mediaRecorder;
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
  recorder.stop();
  await stopped;
  recordAudio.classList.remove("recording");
  recordAudio.setAttribute("aria-label", "Record voice");
  const blob = new Blob(recordedChunks, { type: recorder.mimeType || "audio/webm" });
  mediaRecorder = null;
  const result = await call("listen_to_human", {
    audio_base64: await blobToBase64(blob),
    mime_type: blob.type || "audio/webm"
  });
  const text = typeof result.text === "string" ? result.text.trim() : "";
  if (text) await sendToAgent(text);
}

recordAudio.addEventListener("click", async () => {
  if (mediaRecorder) await stopVoiceRecording();
  else await startVoiceRecording();
});

window.chem0.onAgentEvent((event) => {
  if (event.experiment_id !== experimentId) return;
  if (event.session_id && !sessionId) sessionId = String(event.session_id);
  if (event.type === "message") {
    appendChat(String(event.role ?? "user"), String(event.text ?? ""));
    if (event.role === "assistant") setInFlight(false);
  }
  if (event.type === "assistant_delta") {
    if (!assistantBubble) assistantBubble = appendChat("assistant", "");
    assistantBubble.textContent += String(event.text ?? "");
    chatLog.scrollTop = chatLog.scrollHeight;
    bumpInFlightIdle();
  }
  if (event.type === "tool_response") {
    appendToolBubble(String(event.name ?? "tool"), event.result as JsonObject | undefined);
    assistantBubble = null;
    bumpInFlightIdle();
  }
  if (event.type === "ph_sample") {
    const v = Number(event.value);
    const t = Number(event.timestamp);
    if (Number.isFinite(v) && Number.isFinite(t)) {
      phSamples.push({ value: v, timestamp: t });
      drawPhChart();
    }
  }
  if (event.type === "error") {
    appendChat("error", String(event.message ?? ""));
    setInFlight(false);
  }
});

window.addEventListener("resize", () => drawPhChart());

/* --------------------------- toolbar tooltips --------------------------- */

const tooltipEl = document.createElement("div");
tooltipEl.className = "tooltip";
tooltipEl.setAttribute("role", "tooltip");
tooltipEl.style.display = "none";
document.body.appendChild(tooltipEl);

let tooltipEnabled = true;
let tooltipTarget: HTMLElement | null = null;

function showTooltip(target: HTMLElement): void {
  if (!tooltipEnabled) return;
  const text = target.dataset.tip ?? target.getAttribute("title") ?? "";
  if (!text) return;
  if (target.hasAttribute("title")) {
    target.dataset.tip = text;
    target.removeAttribute("title");
  }
  tooltipEl.textContent = text;
  tooltipEl.style.display = "block";
  const rect = target.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();
  const left = Math.max(4, Math.min(window.innerWidth - tipRect.width - 4, rect.left + rect.width / 2 - tipRect.width / 2));
  const top = rect.bottom + 4;
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
  tooltipTarget = target;
}

function hideTooltip(): void {
  tooltipEl.style.display = "none";
  tooltipTarget = null;
}

document.addEventListener("mouseover", (event) => {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(".icon-btn");
  if (!target || target === tooltipTarget) return;
  showTooltip(target);
});

document.addEventListener("mouseout", (event) => {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(".icon-btn");
  if (!target) return;
  const related = (event.relatedTarget as HTMLElement | null)?.closest<HTMLElement>(".icon-btn");
  if (related === target) return;
  hideTooltip();
});

document.addEventListener("mousedown", () => hideTooltip());
window.addEventListener("blur", () => hideTooltip());

function applySettings(settings: JsonObject): void {
  tooltipEnabled = settings.showToolbarTooltips !== false;
  if (!tooltipEnabled) hideTooltip();
}

void window.chem0.getSettings().then(applySettings);
window.chem0.onSettingsChanged(applySettings);

void boot();
