type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export {};

type Chem0Api = {
  callTool: (name: string, args?: JsonObject) => Promise<JsonObject>;
  platform: string;
  getSettings: () => Promise<JsonObject>;
  onSettingsChanged: (callback: (settings: JsonObject) => void) => () => void;
};

const chem0 = (window as unknown as { chem0: Chem0Api }).chem0;

window.Chem0Shell.applyPlatformClass(chem0?.platform);
window.Chem0Shell.installThemeSync({
  getSettings: () => chem0.getSettings(),
  onSettingsChanged: (handler) => chem0.onSettingsChanged(handler)
});

const params = new URLSearchParams(window.location.search);
const worldId = params.get("world_id") ?? "";

type AssetDef = {
  id: string;
  label: string;
  category: string;
  build: () => { tool: string; name?: string; spec?: JsonObject; pose?: JsonObject; collisionEnabled?: boolean };
};

const ASSET_LIBRARY: AssetDef[] = [
  { id: "arm", label: "SO-101 arm", category: "Robot", build: () => ({ tool: "arm", name: "SO-101 arm" }) },
  { id: "camera", label: "Camera", category: "Sensors", build: () => ({ tool: "camera", name: "Camera" }) },
  { id: "depth_camera", label: "Depth camera", category: "Sensors", build: () => ({ tool: "camera", name: "Depth camera", spec: { resolution: "640x480", fov_degrees: 70, modality: "depth" } }) },
  { id: "light", label: "Area light", category: "Lighting", build: () => ({ tool: "light", name: "Area light", spec: { type: "area", intensity: 1, color: "#ffffff" } }) },
  { id: "spot", label: "Spot light", category: "Lighting", build: () => ({ tool: "light", name: "Spot light", spec: { type: "spot", intensity: 2, color: "#fff5d6" } }) },
  { id: "vial", label: "Vial 1.5mL", category: "Glassware", build: () => ({ tool: "rigid", name: "Vial 1.5mL", spec: { mass_kg: 0.012, collision_shape: "cylinder", radius_m: 0.006, height_m: 0.045, asset: "vial_1_5ml" } }) },
  { id: "vial4", label: "Vial 4mL", category: "Glassware", build: () => ({ tool: "rigid", name: "Vial 4mL", spec: { mass_kg: 0.025, collision_shape: "cylinder", radius_m: 0.009, height_m: 0.05, asset: "vial_4ml" } }) },
  { id: "test_tube", label: "Test tube", category: "Glassware", build: () => ({ tool: "rigid", name: "Test tube", spec: { mass_kg: 0.018, collision_shape: "cylinder", radius_m: 0.0075, height_m: 0.1, asset: "test_tube" } }) },
  { id: "beaker_50", label: "Beaker 50mL", category: "Glassware", build: () => ({ tool: "rigid", name: "Beaker 50mL", spec: { mass_kg: 0.04, collision_shape: "cylinder", radius_m: 0.021, height_m: 0.055, asset: "beaker_50" } }) },
  { id: "beaker_250", label: "Beaker 250mL", category: "Glassware", build: () => ({ tool: "rigid", name: "Beaker 250mL", spec: { mass_kg: 0.11, collision_shape: "cylinder", radius_m: 0.035, height_m: 0.085, asset: "beaker_250" } }) },
  { id: "erlenmeyer", label: "Erlenmeyer 250mL", category: "Glassware", build: () => ({ tool: "rigid", name: "Erlenmeyer 250mL", spec: { mass_kg: 0.13, collision_shape: "cylinder", radius_m: 0.04, height_m: 0.13, asset: "erlenmeyer_250" } }) },
  { id: "round_flask", label: "Round-bottom flask", category: "Glassware", build: () => ({ tool: "rigid", name: "Round flask 250mL", spec: { mass_kg: 0.13, collision_shape: "cylinder", radius_m: 0.04, height_m: 0.09, asset: "round_flask_250" } }) },
  { id: "graduated_cyl", label: "Graduated cylinder", category: "Glassware", build: () => ({ tool: "rigid", name: "Graduated cylinder 100mL", spec: { mass_kg: 0.09, collision_shape: "cylinder", radius_m: 0.014, height_m: 0.215, asset: "graduated_cyl_100" } }) },
  { id: "petri", label: "Petri dish", category: "Glassware", build: () => ({ tool: "rigid", name: "Petri dish", spec: { mass_kg: 0.03, collision_shape: "cylinder", radius_m: 0.045, height_m: 0.015, asset: "petri" } }) },
  { id: "pipette", label: "Pipette", category: "Glassware", build: () => ({ tool: "rigid", name: "Pipette", spec: { mass_kg: 0.02, collision_shape: "cylinder", radius_m: 0.005, height_m: 0.22, asset: "pipette" } }) },
  { id: "burette", label: "Burette 50mL", category: "Glassware", build: () => ({ tool: "rigid", name: "Burette 50mL", spec: { mass_kg: 0.18, collision_shape: "cylinder", radius_m: 0.012, height_m: 0.55, asset: "burette" } }) },
  { id: "reagent_bottle", label: "Reagent bottle", category: "Containers", build: () => ({ tool: "rigid", name: "Reagent bottle", spec: { mass_kg: 0.25, collision_shape: "cylinder", radius_m: 0.035, height_m: 0.13, asset: "reagent_bottle" } }) },
  { id: "sample_tube", label: "Centrifuge tube", category: "Containers", build: () => ({ tool: "rigid", name: "Centrifuge tube 15mL", spec: { mass_kg: 0.02, collision_shape: "cylinder", radius_m: 0.0085, height_m: 0.118, asset: "centrifuge_tube_15" } }) },
  { id: "vial_rack", label: "Vial rack 4×3", category: "Containers", build: () => ({ tool: "rigid", name: "Vial rack", spec: { mass_kg: 0.2, collision_shape: "box", dimensions_m: [0.12, 0.09, 0.035], asset: "vial_rack" } }) },
  { id: "tube_rack", label: "Tube rack", category: "Containers", build: () => ({ tool: "rigid", name: "Tube rack", spec: { mass_kg: 0.18, collision_shape: "box", dimensions_m: [0.18, 0.06, 0.05], asset: "tube_rack" } }) },
  { id: "tray", label: "Tray", category: "Containers", build: () => ({ tool: "rigid", name: "Tray", spec: { mass_kg: 0.35, collision_shape: "box", dimensions_m: [0.3, 0.2, 0.025], asset: "tray" } }) },
  { id: "well_plate", label: "96-well plate", category: "Containers", build: () => ({ tool: "rigid", name: "96-well plate", spec: { mass_kg: 0.07, collision_shape: "box", dimensions_m: [0.127, 0.085, 0.015], asset: "well_plate_96" } }) },
  { id: "hot_plate", label: "Hot plate / stirrer", category: "Equipment", build: () => ({ tool: "rigid", name: "Hot plate stirrer", spec: { mass_kg: 2.5, collision_shape: "box", dimensions_m: [0.18, 0.18, 0.1], asset: "hot_plate" } }) },
  { id: "balance", label: "Analytical balance", category: "Equipment", build: () => ({ tool: "rigid", name: "Analytical balance", spec: { mass_kg: 5, collision_shape: "box", dimensions_m: [0.22, 0.32, 0.12], asset: "balance" } }) },
  { id: "ph_meter", label: "pH meter", category: "Equipment", build: () => ({ tool: "rigid", name: "pH meter", spec: { mass_kg: 0.6, collision_shape: "box", dimensions_m: [0.12, 0.18, 0.06], asset: "ph_meter" } }) },
  { id: "centrifuge", label: "Centrifuge", category: "Equipment", build: () => ({ tool: "rigid", name: "Centrifuge", spec: { mass_kg: 8, collision_shape: "box", dimensions_m: [0.28, 0.28, 0.22], asset: "centrifuge" } }) },
  { id: "vortex", label: "Vortex mixer", category: "Equipment", build: () => ({ tool: "rigid", name: "Vortex mixer", spec: { mass_kg: 2, collision_shape: "box", dimensions_m: [0.12, 0.14, 0.13], asset: "vortex" } }) },
  { id: "stir_bar", label: "Stir bar", category: "Equipment", build: () => ({ tool: "rigid", name: "Stir bar", spec: { mass_kg: 0.005, collision_shape: "cylinder", radius_m: 0.003, height_m: 0.025, asset: "stir_bar" } }) },
  { id: "ring_stand", label: "Ring stand", category: "Equipment", build: () => ({ tool: "rigid", name: "Ring stand", spec: { mass_kg: 1.2, collision_shape: "box", dimensions_m: [0.16, 0.1, 0.6], asset: "ring_stand" } }) },
  { id: "bench", label: "Bench top", category: "Structure", build: () => ({ tool: "rigid", name: "Bench", spec: { mass_kg: 0, collision_shape: "box", dimensions_m: [0.6, 0.4, 0.02], asset: "bench" }, pose: { x: 0.2, y: 0, z: 0.01 } }) },
  { id: "shelf", label: "Shelf", category: "Structure", build: () => ({ tool: "rigid", name: "Shelf", spec: { mass_kg: 0, collision_shape: "box", dimensions_m: [0.5, 0.18, 0.02], asset: "shelf" } }) },
  { id: "fume_wall", label: "Fume hood wall", category: "Structure", build: () => ({ tool: "rigid", name: "Fume hood wall", spec: { mass_kg: 0, collision_shape: "box", dimensions_m: [0.6, 0.02, 0.5], asset: "fume_wall" } }) },
  { id: "box", label: "Box", category: "Primitives", build: () => ({ tool: "rigid", name: "Box", spec: { collision_shape: "box", dimensions_m: [0.05, 0.05, 0.05], asset: "box" } }) },
  { id: "cylinder", label: "Cylinder", category: "Primitives", build: () => ({ tool: "rigid", name: "Cylinder", spec: { collision_shape: "cylinder", radius_m: 0.025, height_m: 0.05, asset: "cylinder" } }) },
  { id: "plate", label: "Plate", category: "Primitives", build: () => ({ tool: "rigid", name: "Plate", spec: { collision_shape: "box", dimensions_m: [0.1, 0.1, 0.005], asset: "plate" } }) }
];

const ASSETS_BY_ID = new Map(ASSET_LIBRARY.map((asset) => [asset.id, asset]));

const titleEl = document.querySelector<HTMLElement>("#vw-title")!;
const subtitleEl = document.querySelector<HTMLElement>("#vw-subtitle")!;
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
const rollInput = document.querySelector<HTMLInputElement>("#vw-roll")!;
const pitchInput = document.querySelector<HTMLInputElement>("#vw-pitch")!;
const yawInput = document.querySelector<HTMLInputElement>("#vw-yaw")!;
const collisionInput = document.querySelector<HTMLInputElement>("#vw-collision")!;
const saveObjectBtn = document.querySelector<HTMLButtonElement>("#vw-save-object")!;
const deleteObjectBtn = document.querySelector<HTMLButtonElement>("#vw-delete-object")!;
const sceneEl = document.querySelector<HTMLElement>("#vw-scene")!;
const dragGhost = document.createElement("div");
dragGhost.className = "vw-drag-ghost";
dragGhost.hidden = true;
document.body.appendChild(dragGhost);
const dropStatus = document.querySelector<HTMLDivElement>("#vw-drop-status")!;

let world: JsonObject | null = null;
let entities: JsonObject[] = [];
let selectedId = "";

type VirtualWorldEditorApi = {
  createEntity: (kind: string, pose?: JsonObject) => Promise<void>;
  getState: () => { world: JsonObject | null; entities: JsonObject[]; selectedId: string; transformMode: "translate" | "rotate" };
  refresh: () => Promise<void>;
  selectEntity: (id: string) => void;
  setTransformMode: (mode: "translate" | "rotate") => void;
  updateEntityPose: (id: string, pose: JsonObject) => Promise<void>;
};

type ToolboxDrag = {
  kind: string;
  source: HTMLButtonElement;
  moved: boolean;
  startX: number;
  startY: number;
};

let toolboxDrag: ToolboxDrag | null = null;
let suppressToolClick = false;
let localDropStatusTimer = 0;
let transformMode: "translate" | "rotate" = "translate";

function pointInScene(x: number, y: number): boolean {
  const rect = sceneEl.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function moveDragGhost(x: number, y: number): void {
  dragGhost.style.transform = `translate(${x + 10}px, ${y + 10}px)`;
}

function showLocalDropStatus(message: string, error = false): void {
  window.clearTimeout(localDropStatusTimer);
  dropStatus.textContent = message;
  dropStatus.classList.toggle("error", error);
  dropStatus.hidden = false;
  localDropStatusTimer = window.setTimeout(() => {
    dropStatus.hidden = true;
    dropStatus.classList.remove("error");
  }, 1800);
}

function finishToolboxDrag(event: MouseEvent): void {
  const drag = toolboxDrag;
  if (!drag) return;
  toolboxDrag = null;
  drag.source.classList.remove("dragging");
  dragGhost.hidden = true;
  if (!drag.moved) return;
  suppressToolClick = true;
  event.preventDefault();
  event.stopPropagation();
  if (!pointInScene(event.clientX, event.clientY)) {
    showLocalDropStatus("Release over scene", true);
    return;
  }
  showLocalDropStatus(`Adding ${drag.kind}`);
  window.dispatchEvent(new CustomEvent("vw:create-at-point", { detail: { kind: drag.kind, clientX: event.clientX, clientY: event.clientY } }));
}

function cancelToolboxDrag(): void {
  if (!toolboxDrag) return;
  toolboxDrag.source.classList.remove("dragging");
  toolboxDrag = null;
  dragGhost.hidden = true;
}

function beginToolboxDrag(source: HTMLButtonElement, event: MouseEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const kind = source.dataset.create ?? "box";
  toolboxDrag = {
    kind,
    source,
    moved: false,
    startX: event.clientX,
    startY: event.clientY
  };
  dragGhost.textContent = source.textContent?.trim() ?? kind;
  moveDragGhost(event.clientX, event.clientY);
  dragGhost.hidden = false;
  source.classList.add("dragging");
  showLocalDropStatus(`Dragging ${kind}`);
}

document.addEventListener("mousedown", (event) => {
  const source = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-create]");
  if (!source) return;
  beginToolboxDrag(source, event);
}, true);

document.addEventListener("mousemove", (event) => {
  if (!toolboxDrag) return;
  const dx = event.clientX - toolboxDrag.startX;
  const dy = event.clientY - toolboxDrag.startY;
  if (Math.hypot(dx, dy) > 4) {
    toolboxDrag.moved = true;
    dragGhost.hidden = false;
  }
  moveDragGhost(event.clientX, event.clientY);
  event.preventDefault();
}, true);

document.addEventListener("mouseup", finishToolboxDrag, true);
window.addEventListener("blur", cancelToolboxDrag);

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

const paneBindings = {
  lhs: window.Chem0Shell.bindPaneTabs({
    buttonAttr: "data-vw-lhs",
    buttonsSelector: "button[data-vw-lhs]",
    initialTab: "toolbox",
    paneAttr: "data-vw-pane",
    paneRoot: document.querySelector<HTMLElement>(".vw-sidebar.lhs") ?? document
  }),
  rhs: window.Chem0Shell.bindPaneTabs({
    buttonAttr: "data-vw-rhs",
    buttonsSelector: "button[data-vw-rhs]",
    initialTab: "world",
    onActivate: (pane) => {
      subtitleEl.textContent = pane;
    },
    paneAttr: "data-vw-pane",
    paneRoot: document.querySelector<HTMLElement>(".vw-sidebar.rhs") ?? document
  })
};

function activatePane(side: "lhs" | "rhs", pane: string): void {
  paneBindings[side].activate(pane);
}

window.Chem0Shell.installToolbarTooltips();

function setTransformMode(mode: "translate" | "rotate"): void {
  transformMode = mode;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-vw-transform]")) {
    button.classList.toggle("active", button.dataset.vwTransform === mode);
  }
  window.dispatchEvent(new CustomEvent("vw:transform-mode", { detail: { mode } }));
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-vw-transform]")) {
  button.addEventListener("click", () => {
    const mode = button.dataset.vwTransform === "rotate" ? "rotate" : "translate";
    setTransformMode(mode);
  });
}

function render(): void {
  if (world) {
    titleEl.textContent = String(world.name ?? "Virtual world");
    subtitleEl.textContent = String(world.id ?? worldId);
    worldNameInput.value = String(world.name ?? "");
  }
  renderAssets();
  renderSelected();
  window.dispatchEvent(new CustomEvent("vw:state", { detail: { world, entities, selectedId, transformMode } }));
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

function renderSelected(): void {
  const entity = selectedEntity();
  selectedEmpty.hidden = Boolean(entity);
  selectedForm.hidden = !entity;
  if (!entity) return;
  const pose = poseOf(entity);
  objectNameInput.value = String(entity.name ?? "");
  posXInput.value = String(numberAt(pose, "x"));
  posYInput.value = String(numberAt(pose, "y"));
  posZInput.value = String(numberAt(pose, "z"));
  rollInput.value = String(numberAt(pose, "roll"));
  pitchInput.value = String(numberAt(pose, "pitch"));
  yawInput.value = String(numberAt(pose, "yaw"));
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

function defaultPoseFor(tool: string): JsonObject {
  if (tool === "camera") return { x: 0.2, y: -0.2, z: 0.4 };
  if (tool === "light") return { x: 0, y: -0.25, z: 0.6 };
  if (tool === "arm") return { x: 0, y: 0, z: 0 };
  return { x: 0.1, y: 0.1, z: 0.03 };
}

async function createEntity(kind: string, poseOverride: JsonObject = {}): Promise<void> {
  const asset = ASSETS_BY_ID.get(kind);
  const def = asset
    ? asset.build()
    : { tool: "rigid", name: kind, spec: { collision_shape: "box", dimensions_m: [0.05, 0.05, 0.05], asset: kind } };
  const pose = { ...defaultPoseFor(def.tool), ...(def.pose ?? {}), ...poseOverride };
  if (def.tool === "arm") {
    const result = await chem0.callTool("create_virtual_arm", { world_id: worldId, name: def.name ?? "SO-101 arm", make_default: true, pose });
    selectedId = String((result.entity as JsonObject | undefined)?.id ?? "");
  } else if (def.tool === "camera") {
    const result = await chem0.callTool("create_virtual_camera", { world_id: worldId, name: def.name ?? "Camera", pose, spec: def.spec ?? {} });
    selectedId = String((result.entity as JsonObject | undefined)?.id ?? "");
  } else if (def.tool === "light") {
    const result = await chem0.callTool("create_virtual_light", { world_id: worldId, name: def.name ?? "Light", pose, spec: def.spec ?? {} });
    selectedId = String((result.entity as JsonObject | undefined)?.id ?? "");
  } else {
    const result = await chem0.callTool("create_virtual_rigid_body", {
      world_id: worldId,
      name: def.name ?? "Rigid body",
      pose,
      spec: def.spec ?? { collision_shape: "box", dimensions_m: [0.05, 0.05, 0.05] },
      collision_enabled: def.collisionEnabled !== false
    });
    selectedId = String((result.entity as JsonObject | undefined)?.id ?? "");
  }
  await refresh();
}

function renderToolbox(): void {
  const toolbox = document.querySelector<HTMLElement>("#vw-toolbox");
  if (!toolbox) return;
  toolbox.replaceChildren();
  const byCategory = new Map<string, AssetDef[]>();
  for (const asset of ASSET_LIBRARY) {
    const list = byCategory.get(asset.category) ?? [];
    list.push(asset);
    byCategory.set(asset.category, list);
  }
  for (const [category, items] of byCategory) {
    const section = document.createElement("section");
    section.className = "pane-section vw-group";
    const heading = document.createElement("h2");
    heading.textContent = category;
    section.append(heading);
    for (const item of items) {
      const btn = document.createElement("button");
      btn.className = "vw-tool";
      btn.dataset.create = item.id;
      btn.textContent = `+ ${item.label}`;
      section.append(btn);
    }
    toolbox.append(section);
  }
}

renderToolbox();

for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-create]")) {
  btn.addEventListener("click", (event) => {
    if (suppressToolClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressToolClick = false;
      return;
    }
    void createEntity(btn.dataset.create ?? "box");
  });
}

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
    z: Number(posZInput.value) || 0,
    roll: Number(rollInput.value) || 0,
    pitch: Number(pitchInput.value) || 0,
    yaw: Number(yawInput.value) || 0
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

const editorApi: VirtualWorldEditorApi = {
  createEntity,
  getState: () => ({ world, entities, selectedId, transformMode }),
  refresh,
  selectEntity: (id: string) => {
    selectedId = id;
    activatePane("rhs", "selected");
    render();
  },
  setTransformMode,
  updateEntityPose: async (id: string, pose: JsonObject) => {
    const entity = entities.find((item) => String(item.id) === id);
    if (!entity) return;
    await chem0.callTool("update_virtual_entity", {
      entity_id: id,
      pose,
      spec: (entity.spec as JsonObject) ?? {},
      collision_enabled: entity.collision_enabled === true
    });
    await refresh();
  }
};

(window as unknown as { virtualWorldEditor: VirtualWorldEditorApi }).virtualWorldEditor = editorApi;

void refresh();
