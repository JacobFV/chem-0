type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export {};

type Chem0Api = {
  callTool: (name: string, args?: JsonObject) => Promise<JsonObject>;
  platform: string;
};

const chem0 = (window as unknown as { chem0: Chem0Api }).chem0;

document.body.classList.add(`platform-${chem0?.platform ?? "darwin"}`);

const params = new URLSearchParams(window.location.search);
const worldId = params.get("world_id") ?? "";

const titleEl = document.querySelector<HTMLHeadingElement>("#vw-title")!;
const subtitleEl = document.querySelector<HTMLDivElement>("#vw-subtitle")!;
const sceneEl = document.querySelector<HTMLDivElement>("#vw-scene")!;
const gimbalEl = document.querySelector<HTMLDivElement>("#vw-gimbal")!;
const assetList = document.querySelector<HTMLUListElement>("#vw-asset-list")!;
const refreshBtn = document.querySelector<HTMLButtonElement>("#vw-refresh")!;
const worldNameInput = document.querySelector<HTMLInputElement>("#vw-world-name")!;
const saveWorldBtn = document.querySelector<HTMLButtonElement>("#vw-save-world")!;
const selectedEmpty = document.querySelector<HTMLDivElement>("#vw-selected-empty")!;
const selectedForm = document.querySelector<HTMLDivElement>("#vw-selected-form")!;
const objectNameInput = document.querySelector<HTMLInputElement>("#vw-object-name")!;
const posXInput = document.querySelector<HTMLInputElement>("#vw-pos-x")!;
const posYInput = document.querySelector<HTMLInputElement>("#vw-pos-y")!;
const posZInput = document.querySelector<HTMLInputElement>("#vw-pos-z")!;
const collisionInput = document.querySelector<HTMLInputElement>("#vw-collision")!;
const saveObjectBtn = document.querySelector<HTMLButtonElement>("#vw-save-object")!;
const deleteObjectBtn = document.querySelector<HTMLButtonElement>("#vw-delete-object")!;

let world: JsonObject | null = null;
let entities: JsonObject[] = [];
let selectedId = "";

function poseOf(entity: JsonObject): JsonObject {
  const pose = entity.pose;
  return pose && typeof pose === "object" && !Array.isArray(pose) ? (pose as JsonObject) : {};
}

function numberAt(object: JsonObject, key: string, fallback = 0): number {
  const value = Number(object[key]);
  return Number.isFinite(value) ? value : fallback;
}

function selectedEntity(): JsonObject | undefined {
  return entities.find((entity) => String(entity.id) === selectedId);
}

function activatePane(side: "lhs" | "rhs", pane: string): void {
  const attr = side === "lhs" ? "data-vw-lhs" : "data-vw-rhs";
  for (const btn of document.querySelectorAll<HTMLButtonElement>(`button[${attr}]`)) {
    btn.classList.toggle("active", btn.getAttribute(attr) === pane);
  }
  const scope = side === "lhs" ? ".vw-sidebar.lhs" : ".vw-sidebar.rhs";
  for (const el of document.querySelectorAll<HTMLElement>(`${scope} .vw-pane`)) {
    el.classList.toggle("active", el.dataset.vwPane === pane);
  }
}

for (const btn of document.querySelectorAll<HTMLButtonElement>("button[data-vw-lhs]")) {
  btn.addEventListener("click", () => activatePane("lhs", btn.dataset.vwLhs ?? "toolbox"));
}
for (const btn of document.querySelectorAll<HTMLButtonElement>("button[data-vw-rhs]")) {
  btn.addEventListener("click", () => activatePane("rhs", btn.dataset.vwRhs ?? "world"));
}

function render(): void {
  if (world) {
    titleEl.textContent = String(world.name ?? "Virtual world");
    subtitleEl.textContent = String(world.id ?? worldId);
    worldNameInput.value = String(world.name ?? "");
  }
  renderAssets();
  renderScene();
  renderSelected();
}

function renderAssets(): void {
  assetList.replaceChildren();
  for (const entity of entities) {
    const li = document.createElement("li");
    li.className = "list-item";
    if (String(entity.id) === selectedId) li.classList.add("active");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = String(entity.name ?? entity.id);
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = `${String(entity.kind)} · ${String(entity.id)}`;
    li.append(title, sub);
    li.addEventListener("click", () => {
      selectedId = String(entity.id);
      activatePane("rhs", "selected");
      render();
    });
    assetList.append(li);
  }
}

function renderScene(): void {
  sceneEl.replaceChildren();
  const rect = sceneEl.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  for (const entity of entities) {
    const pose = poseOf(entity);
    const x = numberAt(pose, "x");
    const y = numberAt(pose, "y");
    const node = document.createElement("div");
    const kind = String(entity.kind);
    node.className = `vw-object ${kind}`;
    if (String(entity.id) === selectedId) node.classList.add("selected");
    node.textContent = kind === "rigid_body" ? "obj" : kind;
    node.style.left = `${width / 2 + x * 520 - 18}px`;
    node.style.top = `${height / 2 + y * 520 - 18}px`;
    node.addEventListener("click", () => {
      selectedId = String(entity.id);
      activatePane("rhs", "selected");
      render();
    });
    sceneEl.append(node);
  }
}

function renderSelected(): void {
  const entity = selectedEntity();
  selectedEmpty.hidden = Boolean(entity);
  selectedForm.hidden = !entity;
  gimbalEl.hidden = !entity;
  if (!entity) return;
  const pose = poseOf(entity);
  objectNameInput.value = String(entity.name ?? "");
  posXInput.value = String(numberAt(pose, "x"));
  posYInput.value = String(numberAt(pose, "y"));
  posZInput.value = String(numberAt(pose, "z"));
  collisionInput.checked = entity.collision_enabled === true;
}

async function refresh(): Promise<void> {
  const result = await chem0.callTool("list_worlds", {});
  const worlds = (result.worlds ?? []) as JsonObject[];
  world = worlds.find((item) => String(item.id) === worldId) ?? null;
  entities = ((result.virtual_entities ?? []) as JsonObject[]).filter((entity) => String(entity.world_id) === worldId);
  if (selectedId && !entities.some((entity) => String(entity.id) === selectedId)) selectedId = "";
  render();
}

async function createEntity(kind: string, poseOverride: JsonObject = {}): Promise<void> {
  const pose = (fallback: JsonObject) => ({ ...fallback, ...poseOverride });
  if (kind === "arm") {
    const result = await chem0.callTool("create_virtual_arm", { world_id: worldId, name: "SO-101 arm", make_default: true, pose: pose({ x: 0, y: 0, z: 0 }) });
    selectedId = String((result.entity as JsonObject | undefined)?.id ?? "");
  } else if (kind === "camera") {
    const result = await chem0.callTool("create_virtual_camera", { world_id: worldId, name: "Camera", pose: pose({ x: 0.2, y: -0.2, z: 0.4 }) });
    selectedId = String((result.entity as JsonObject | undefined)?.id ?? "");
  } else if (kind === "light") {
    const result = await chem0.callTool("create_virtual_light", { world_id: worldId, name: "Light", pose: pose({ x: 0, y: -0.25, z: 0.6 }) });
    selectedId = String((result.entity as JsonObject | undefined)?.id ?? "");
  } else {
    const result = await chem0.callTool("create_virtual_rigid_body", {
      world_id: worldId,
      name: kind === "vial" ? "Vial proxy" : "Box",
      pose: pose({ x: 0.1, y: 0.1, z: 0.03 }),
      spec: kind === "vial"
        ? { mass_kg: 0.04, collision_shape: "cylinder", radius_m: 0.012, height_m: 0.05, collision_mode: "full", collides_with: ["arm", "rigid_body"] }
        : { mass_kg: 0.1, collision_shape: "box", dimensions_m: [0.05, 0.05, 0.05], collision_mode: "full", collides_with: ["arm", "rigid_body"] }
    });
    selectedId = String((result.entity as JsonObject | undefined)?.id ?? "");
  }
  await refresh();
}

for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-create]")) {
  btn.addEventListener("click", () => void createEntity(btn.dataset.create ?? "box"));
  btn.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", btn.dataset.create ?? "box");
  });
}

sceneEl.addEventListener("dragover", (event) => event.preventDefault());
sceneEl.addEventListener("drop", (event) => {
  event.preventDefault();
  const kind = event.dataTransfer?.getData("text/plain") || "box";
  const rect = sceneEl.getBoundingClientRect();
  const x = (event.clientX - rect.left - rect.width / 2) / 520;
  const y = (event.clientY - rect.top - rect.height / 2) / 520;
  void createEntity(kind, { x, y });
});

refreshBtn.addEventListener("click", () => void refresh());
saveWorldBtn.addEventListener("click", async () => {
  await chem0.callTool("update_world", { world_id: worldId, name: worldNameInput.value.trim() || "Virtual world", metadata: (world?.metadata as JsonObject) ?? {} });
  await refresh();
});

async function saveSelected(): Promise<void> {
  const entity = selectedEntity();
  if (!entity) return;
  const pose = {
    ...poseOf(entity),
    x: Number(posXInput.value) || 0,
    y: Number(posYInput.value) || 0,
    z: Number(posZInput.value) || 0
  };
  await chem0.callTool("update_virtual_entity", {
    entity_id: String(entity.id),
    name: objectNameInput.value.trim() || String(entity.name ?? entity.id),
    pose,
    spec: (entity.spec as JsonObject) ?? {},
    collision_enabled: collisionInput.checked
  });
  await refresh();
}

saveObjectBtn.addEventListener("click", () => void saveSelected());
deleteObjectBtn.addEventListener("click", async () => {
  const entity = selectedEntity();
  if (!entity || !window.confirm(`Remove ${String(entity.name ?? entity.id)}?`)) return;
  await chem0.callTool("delete_virtual_entity", { entity_id: String(entity.id) });
  selectedId = "";
  await refresh();
});

for (const btn of gimbalEl.querySelectorAll<HTMLButtonElement>("button[data-axis]")) {
  btn.addEventListener("click", async () => {
    const entity = selectedEntity();
    if (!entity) return;
    const pose = poseOf(entity);
    const axis = btn.dataset.axis ?? "x";
    const delta = Number(btn.dataset.delta) || 0;
    pose[axis] = numberAt(pose, axis) + delta;
    await chem0.callTool("update_virtual_entity", {
      entity_id: String(entity.id),
      pose,
      spec: (entity.spec as JsonObject) ?? {},
      collision_enabled: entity.collision_enabled === true
    });
    await refresh();
  });
}

void refresh();
