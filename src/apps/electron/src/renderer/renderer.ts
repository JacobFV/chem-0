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
      openVirtualWorldWindow: (worldId: string) => Promise<JsonObject>;
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

window.Chem0Shell.applyPlatformClass(window.chem0?.platform);

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
const confirmModal = document.querySelector<HTMLDivElement>("#confirm-modal")!;
const confirmModalTitle = document.querySelector<HTMLHeadingElement>("#confirm-modal-title")!;
const confirmModalKind = document.querySelector<HTMLSpanElement>("#confirm-modal-kind")!;
const confirmModalMessage = document.querySelector<HTMLParagraphElement>("#confirm-modal-message")!;
const confirmModalCancel = document.querySelector<HTMLButtonElement>("#confirm-modal-cancel")!;
const confirmModalConfirm = document.querySelector<HTMLButtonElement>("#confirm-modal-confirm")!;
const refreshWorldsBtn = document.querySelector<HTMLButtonElement>("#refresh-worlds")!;
const virtualArmNameInput = document.querySelector<HTMLInputElement>("#virtual-arm-name")!;
const createVirtualArmBtn = document.querySelector<HTMLButtonElement>("#create-virtual-arm")!;
const setDefaultRobot = document.querySelector<HTMLButtonElement>("#set-default-robot")!;
const refreshRobotsBtn = document.querySelector<HTMLButtonElement>("#refresh-robots")!;
const refreshArtifactsBtn = document.querySelector<HTMLButtonElement>("#refresh-artifacts")!;
const activeExperiment = document.querySelector<HTMLSpanElement>("#active-experiment")!;
const activeWorld = document.querySelector<HTMLSpanElement>("#active-world")!;
const experimentPickerButton = document.querySelector<HTMLButtonElement>("#experiment-picker-button")!;
const experimentPickerMenu = document.querySelector<HTMLDivElement>("#experiment-picker-menu")!;
const worldPickerButton = document.querySelector<HTMLButtonElement>("#world-picker-button")!;
const worldPickerMenu = document.querySelector<HTMLDivElement>("#world-picker-menu")!;
const chatLog = document.querySelector<HTMLDivElement>("#chat-log")!;
const chatInput = document.querySelector<HTMLTextAreaElement>("#chat-input")!;
const sendMessage = document.querySelector<HTMLButtonElement>("#send-message")!;
const recordAudio = document.querySelector<HTMLButtonElement>("#record-audio")!;
const phCanvas = document.querySelector<HTMLCanvasElement>("#ph-canvas");
const camerasStrip = document.querySelector<HTMLDivElement>(".cameras-strip")!;
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
let activeBrowserCameraIds = new Set<number>();
const virtualCameraCells = new Map<string, HTMLElement>();
let physicalCameraWorldAssignments: Record<string, string> = JSON.parse(
  localStorage.getItem("chem0:physical-camera-worlds") ?? "{}"
) as Record<string, string>;

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
let confirmResolver: ((confirmed: boolean) => void) | null = null;

type PhSample = { value: number; timestamp: number };
const phSamples: PhSample[] = [];

function closeConfirmModal(confirmed: boolean): void {
  confirmModal.hidden = true;
  const resolver = confirmResolver;
  confirmResolver = null;
  resolver?.(confirmed);
}

function confirmAction(options: { title: string; kind?: string; message: string; confirmLabel?: string }): Promise<boolean> {
  if (confirmResolver) closeConfirmModal(false);
  confirmModalTitle.textContent = options.title;
  confirmModalKind.textContent = options.kind ?? "";
  confirmModalMessage.textContent = options.message;
  confirmModalConfirm.textContent = options.confirmLabel ?? "Confirm";
  confirmModal.hidden = false;
  confirmModalConfirm.focus();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

confirmModalCancel.addEventListener("click", () => closeConfirmModal(false));
confirmModalConfirm.addEventListener("click", () => closeConfirmModal(true));
confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) closeConfirmModal(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmModal.hidden) closeConfirmModal(false);
});

function setActiveExperimentLabel(text: string, active: boolean): void {
  activeExperiment.textContent = text;
  experimentPickerButton.classList.toggle("active", active);
}

function setActiveWorldLabel(): void {
  const world = selectedWorld();
  const name = String(world?.name ?? selectedWorldId);
  const type = String(world?.type ?? "world");
  activeWorld.textContent = `${name} · ${type}`;
  worldPickerButton.classList.toggle("active", Boolean(world));
  document.body.dataset.worldId = selectedWorldId;
  document.body.dataset.worldType = type;
  window.dispatchEvent(new CustomEvent("chem0:world-selected", { detail: { worldId: selectedWorldId, worldType: type } }));
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
    experimentId ? String(experiment.name ?? "Experiment") : "No experiment",
    Boolean(experimentId)
  );
  updateExperimentsListSelection();
  renderPickerMenus();
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

function closeAppbarMenus(): void {
  experimentPickerMenu.hidden = true;
  worldPickerMenu.hidden = true;
  experimentPickerButton.setAttribute("aria-expanded", "false");
  worldPickerButton.setAttribute("aria-expanded", "false");
}

function menuButton(label: string, sub: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "appbar-menu-item";
  button.classList.toggle("active", active);
  const title = document.createElement("span");
  title.className = "appbar-menu-title";
  title.textContent = label;
  const meta = document.createElement("span");
  meta.className = "appbar-menu-meta";
  meta.textContent = sub;
  button.append(title, meta);
  button.addEventListener("click", () => {
    closeAppbarMenus();
    onClick();
  });
  return button;
}

function renderPickerMenus(): void {
  experimentPickerMenu.replaceChildren();
  for (const experiment of experimentsCache) {
    const id = String(experiment.id ?? "");
    const world = worldsCache.find((item) => String(item.id) === String(experiment.world_id ?? ""));
    experimentPickerMenu.append(menuButton(
      String(experiment.name ?? "Untitled"),
      String(world?.name ?? experiment.world_id ?? id),
      id === experimentId,
      () => void selectExperiment(id)
    ));
  }
  if (experimentsCache.length > 0) {
    const divider = document.createElement("div");
    divider.className = "appbar-menu-divider";
    experimentPickerMenu.append(divider);
  }
  experimentPickerMenu.append(menuButton("+ New Experiment", "create in current world", false, () => void createExperimentFromCurrentWorld()));

  worldPickerMenu.replaceChildren();
  for (const world of worldsCache) {
    const id = String(world.id ?? "");
    const experimentCount = experimentsCache.filter((experiment) => String(experiment.world_id ?? "") === id).length;
    worldPickerMenu.append(menuButton(
      String(world.name ?? id),
      `${String(world.type ?? "world")} · ${experimentCount} experiment${experimentCount === 1 ? "" : "s"}`,
      id === selectedWorldId,
      () => void selectWorld(id, { matchExperiment: true })
    ));
  }
  if (worldsCache.length > 0) {
    const divider = document.createElement("div");
    divider.className = "appbar-menu-divider";
    worldPickerMenu.append(divider);
  }
  const newWorld = document.createElement("div");
  newWorld.className = "appbar-submenu";
  const label = document.createElement("div");
  label.className = "appbar-submenu-label";
  label.textContent = "+ New World";
  const options = document.createElement("div");
  options.className = "appbar-submenu-options";
  options.append(
    menuButton("Physical World", "hardware bench", false, () => openWorldModal("create", "physical")),
    menuButton("Virtual World", "simulation", false, () => openWorldModal("create", "virtual"))
  );
  newWorld.append(label, options);
  worldPickerMenu.append(newWorld);
  setActiveWorldLabel();
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
      void selectExperiment(id);
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
  setActiveWorldLabel();
  updateCameraVisibility(activeBrowserCameraIds);
  for (const li of worldsList.querySelectorAll<HTMLLIElement>(".world-card")) {
    li.classList.toggle("active", li.dataset.worldId === selectedWorldId);
  }
}

function worldEntities(worldId: string): JsonObject[] {
  return virtualEntitiesCache.filter((entity) => String(entity.world_id) === worldId);
}

function savePhysicalCameraAssignments(): void {
  localStorage.setItem("chem0:physical-camera-worlds", JSON.stringify(physicalCameraWorldAssignments));
}

function worldType(worldId: string): string {
  return String(worldsCache.find((world) => String(world.id) === worldId)?.type ?? "");
}

function assignCameraToWorld(input: { cameraId: string; cameraKind: "physical" | "virtual"; worldId: string }): void {
  const targetType = worldType(input.worldId);
  if (input.cameraKind === "virtual") {
    const entity = virtualEntitiesCache.find((item) => String(item.id) === input.cameraId && item.kind === "camera");
    if (!entity) throw new Error(`Unknown virtual camera: ${input.cameraId}`);
    if (String(entity.world_id) !== input.worldId) throw new Error("Virtual cameras stay in the virtual world they were created in.");
    if (targetType !== "virtual") throw new Error("Virtual cameras can only appear in virtual worlds.");
    return;
  }
  if (targetType !== "physical") throw new Error("Physical cameras can only be assigned to physical worlds.");
  physicalCameraWorldAssignments[input.cameraId] = input.worldId;
  savePhysicalCameraAssignments();
}

function physicalCameraWorldId(slot: number): string {
  const id = String(slot);
  const assigned = physicalCameraWorldAssignments[id];
  if (assigned && worldType(assigned) === "physical") return assigned;
  assignCameraToWorld({ cameraId: id, cameraKind: "physical", worldId: "world_physical_default" });
  return "world_physical_default";
}

function iconSvg(name: "check" | "config" | "edit" | "plus" | "trash" | "x"): string {
  if (name === "check") return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8.2l3 3L13 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (name === "config") return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 2l.6 1.5 1.6-.3.4 1.5 1.5.7-.9 1.3.9 1.3-1.5.7-.4 1.5-1.6-.3L8 14l-.6-1.5-1.6.3-.4-1.5-1.5-.7.9-1.3-.9-1.3 1.5-.7.4-1.5 1.6.3z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
  if (name === "edit") return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 11.8V14h2.2L12.5 6.7l-2.2-2.2L3 11.8zM9.7 5.1l2.2 2.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (name === "plus") return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  if (name === "trash") return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 4h10M6 4V2.8h4V4M5 6v7M8 6v7M11 6v7M4.5 4l.5 10h6l.5-10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function makeGhostIcon(name: "check" | "config" | "edit" | "plus" | "trash" | "x", label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "ghost-icon";
  button.innerHTML = iconSvg(name);
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}

function drawFallbackPlanet(ctx: CanvasRenderingContext2D, size: number, label: string, hue: number): void {
  const gradient = ctx.createRadialGradient(size * 0.32, size * 0.28, 4, size * 0.5, size * 0.5, size * 0.72);
  gradient.addColorStop(0, `hsl(${hue}, 68%, 52%)`);
  gradient.addColorStop(0.55, `hsl(${(hue + 48) % 360}, 52%, 30%)`);
  gradient.addColorStop(1, "#050505");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "500 10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label.slice(0, 18), size / 2, size / 2);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): boolean {
  const maybeVideo = source as HTMLVideoElement;
  const maybeCanvas = source as HTMLCanvasElement;
  const sourceW = maybeVideo.videoWidth || maybeCanvas.width || 0;
  const sourceH = maybeVideo.videoHeight || maybeCanvas.height || 0;
  if (sourceW <= 0 || sourceH <= 0) return false;
  const scale = Math.max(dw / sourceW, dh / sourceH);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = Math.max(0, (sourceW - sw) / 2);
  const sy = Math.max(0, (sourceH - sh) / 2);
  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
  return true;
}

function drawWorldPreviewCanvas(canvas: HTMLCanvasElement, world: JsonObject): void {
  const size = 320;
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const worldId = String(world.id ?? "");
  const isVirtual = world.type === "virtual";
  const virtualCameras = worldEntities(worldId).filter((entity) => entity.kind === "camera");
  const physicalVideos = camVideos
    .map((video, index) => ({ video, index }))
    .filter((item) =>
      item.video &&
      activeBrowserCameraIds.has(item.index) &&
      item.video.readyState >= 2 &&
      physicalCameraWorldId(item.index) === worldId
    );
  const tiles = isVirtual ? virtualCameras : physicalVideos;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, size, size);
  if (tiles.length === 0) {
    const hue = Array.from(worldId).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
    drawFallbackPlanet(ctx, size, isVirtual ? "no virtual cameras" : "no camera feed", hue);
  } else {
    const cols = Math.ceil(Math.sqrt(tiles.length));
    const rows = Math.ceil(tiles.length / cols);
    const tileW = size / cols;
    const tileH = size / rows;
    tiles.forEach((tile, index) => {
      const x = (index % cols) * tileW;
      const y = Math.floor(index / cols) * tileH;
      if (isVirtual) {
        const entity = tile as JsonObject;
        const streamCanvas = worldsList.ownerDocument.querySelector<HTMLCanvasElement>(
          `.virtual-camera-preview[data-camera-id="${String(entity.id)}"]`
        );
        const drewStream = streamCanvas ? drawImageCover(ctx, streamCanvas, x, y, tileW, tileH) : false;
        if (!drewStream) {
          const hue = Array.from(String(entity.id ?? index)).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
          const gradient = ctx.createLinearGradient(x, y, x + tileW, y + tileH);
          gradient.addColorStop(0, `hsl(${hue}, 62%, 44%)`);
          gradient.addColorStop(1, `hsl(${(hue + 92) % 360}, 54%, 18%)`);
          ctx.fillStyle = gradient;
          ctx.fillRect(x, y, tileW, tileH);
          ctx.fillStyle = "rgba(255,255,255,0.76)";
          ctx.font = "500 10px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(entity.name ?? "camera").slice(0, 16), x + tileW / 2, y + tileH / 2);
        }
      } else {
        const video = (tile as { video: HTMLVideoElement | null }).video;
        if (video) drawImageCover(ctx, video, x, y, tileW, tileH);
      }
    });
  }
  ctx.restore();
  ctx.strokeStyle = worldId === selectedWorldId ? "#f5d76e" : "#2a2a2a";
  ctx.lineWidth = worldId === selectedWorldId ? 5 : 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.stroke();
}

function updateWorldPreviewCanvases(): void {
  for (const canvas of worldsList.querySelectorAll<HTMLCanvasElement>(".world-orb-canvas")) {
    const worldId = canvas.dataset.worldId ?? "";
    const world = worldsCache.find((item) => String(item.id) === worldId);
    if (world) drawWorldPreviewCanvas(canvas, world);
  }
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
    li.className = "world-card";
    li.dataset.worldId = id;
    if (id === selectedWorldId) li.classList.add("active");
    const orb = document.createElement("button");
    orb.type = "button";
    orb.className = "world-orb";
    orb.setAttribute("aria-label", `Select ${String(world.name ?? id)}`);
    const canvas = document.createElement("canvas");
    canvas.className = "world-orb-canvas";
    canvas.dataset.worldId = id;
    orb.append(canvas);
    if (world.type === "virtual") {
      const configText = document.createElement("span");
      configText.className = "world-orb-config";
      configText.textContent = "Configure";
      configText.addEventListener("click", async (event) => {
        event.stopPropagation();
        show(await window.chem0.openVirtualWorldWindow(id));
      });
      orb.append(configText);
    }
    orb.addEventListener("click", () => {
      void selectWorld(id, { matchExperiment: true });
    });

    const labelRow = document.createElement("div");
    labelRow.className = "world-label-row";
    const title = document.createElement("div");
    title.className = "world-label-title";
    title.textContent = String(world.name ?? id);
    const titleActions = document.createElement("div");
    titleActions.className = "row-icon-actions";
    const edit = makeGhostIcon("edit", "Rename world");
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
      startWorldInlineEdit(labelRow, title, world);
    });
    titleActions.append(edit);
    const del = makeGhostIcon("trash", "Delete world");
    del.disabled = id === "world_physical_default";
    del.addEventListener("click", async (event) => {
      event.stopPropagation();
      const worldName = String(world.name ?? id);
      if (del.disabled) return;
      const confirmed = await confirmAction({
        title: `Delete ${worldName}`,
        kind: String(world.type ?? "world"),
        message: `Delete ${worldName}? This removes the world and its local assignments.`,
        confirmLabel: "Delete"
      });
      if (!confirmed) return;
      try {
        show(await window.chem0.callTool("delete_world", { world_id: id }));
        selectedWorldId = "world_physical_default";
        await refreshWorlds();
        void refreshRobots();
      } catch (error) {
        show({ delete_world_error: error instanceof Error ? error.message : String(error) });
      }
    });
    titleActions.append(del);
    labelRow.append(title, titleActions);
    const meta = document.createElement("div");
    meta.className = "world-label-meta";
    const defaultRobot = world.default_robot_id ? `default ${String(world.default_robot_id)}` : "no default arm";
    const cameraCount = world.type === "virtual"
      ? worldEntities(id).filter((entity) => entity.kind === "camera").length
      : Array.from(activeBrowserCameraIds).filter((slot) => physicalCameraWorldId(slot) === id).length;
    meta.textContent = `${String(world.type ?? "world")} · ${cameraCount} camera${cameraCount === 1 ? "" : "s"} · ${defaultRobot}`;
    li.append(orb, labelRow, meta);
    li.addEventListener("click", (event) => {
      if ((event.target as HTMLElement | null)?.closest("button")) return;
      void selectWorld(id, { matchExperiment: true });
    });
    worldsList.append(li);
  }
  syncSelectedWorldState();
  renderPickerMenus();
  updateWorldPreviewCanvases();
}

function startWorldInlineEdit(header: HTMLDivElement, title: HTMLDivElement, world: JsonObject): void {
  const id = String(world.id);
  const input = document.createElement("input");
  input.className = "world-title-input";
  input.value = String(world.name ?? id);
  title.replaceWith(input);
  const actions = header.querySelector<HTMLDivElement>(".row-icon-actions");
  if (!actions) return;
  actions.replaceChildren();
  const save = makeGhostIcon("check", "Save world name");
  save.addEventListener("click", async (event) => {
    event.stopPropagation();
    const name = input.value.trim() || String(world.name ?? id);
    show(await window.chem0.callTool("update_world", { world_id: id, name, metadata: (world.metadata as JsonObject) ?? {} }));
    await refreshWorlds();
  });
  actions.append(save);
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void save.click();
    if (event.key === "Escape") renderWorldsList();
  });
  input.focus();
  input.select();
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

async function clearActiveExperiment(): Promise<void> {
  experimentId = "";
  sessionId = "";
  experimentSelect.value = "";
  setActiveExperimentLabel("No experiment", false);
  updateExperimentsListSelection();
  updateNotesPane();
  await loadEvents();
  void refreshArtifacts();
  renderPickerMenus();
}

async function selectExperiment(id: string): Promise<void> {
  const experiment = experimentsCache.find((item) => String(item.id) === id);
  if (!experiment) {
    await clearActiveExperiment();
    return;
  }
  setActive(experiment);
  await loadEvents();
  void refreshArtifacts();
  void refreshRobots();
}

async function selectWorld(id: string, options: { matchExperiment?: boolean } = {}): Promise<void> {
  if (!worldsCache.some((world) => String(world.id) === id)) return;
  selectedWorldId = id;
  syncSelectedWorldState();
  renderWorldsList();
  if (options.matchExperiment && experimentId) {
    const activeExperiment = experimentsCache.find((item) => String(item.id) === experimentId);
    if (String(activeExperiment?.world_id ?? "") !== id) {
      const nextExperiment = experimentsCache.find((item) => String(item.world_id ?? "") === id);
      if (nextExperiment) await selectExperiment(String(nextExperiment.id));
      else await clearActiveExperiment();
    }
  } else {
    renderPickerMenus();
  }
  void refreshRobots();
}

async function createExperimentFromCurrentWorld(): Promise<void> {
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
}

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
  renderPickerMenus();
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
  activeBrowserCameraIds = new Set(activeIds);
  renderSelectedWorldCameras();
  updateWorldPreviewCanvases();
}

function renderSelectedWorldCameras(): void {
  const world = selectedWorld();
  const showPhysicalCameras = world?.type === "physical";
  for (let i = 0; i < camVideos.length; i++) {
    const cell = camVideos[i]?.closest(".camera-cell") as HTMLElement | null;
    if (!cell) continue;
    const assignedHere = showPhysicalCameras && activeBrowserCameraIds.has(i) && physicalCameraWorldId(i) === selectedWorldId;
    cell.classList.toggle("hidden", !assignedHere);
  }
  const selectedVirtualCameras = world?.type === "virtual"
    ? worldEntities(selectedWorldId).filter((entity) => entity.kind === "camera")
    : [];
  const visibleIds = new Set(selectedVirtualCameras.map((camera) => String(camera.id)));
  for (const [id, cell] of virtualCameraCells) {
    if (visibleIds.has(id)) continue;
    cell.remove();
    virtualCameraCells.delete(id);
  }
  for (const camera of selectedVirtualCameras) {
    const id = String(camera.id);
    let cell = virtualCameraCells.get(id);
    if (!cell) {
      cell = document.createElement("div");
      cell.className = "camera-cell virtual-camera-cell";
      cell.dataset.cameraId = id;
      cell.dataset.cameraKind = "virtual";
      const frame = document.createElement("div");
      frame.className = "camera-frame";
      const canvas = document.createElement("canvas");
      canvas.className = "virtual-camera-preview";
      canvas.dataset.cameraId = id;
      frame.append(canvas);
      const label = document.createElement("div");
      label.className = "camera-label";
      cell.append(frame, label);
      camerasStrip.append(cell);
      virtualCameraCells.set(id, cell);
    }
    assignCameraToWorld({ cameraId: id, cameraKind: "virtual", worldId: selectedWorldId });
    const label = cell.querySelector<HTMLElement>(".camera-label");
    const canvas = cell.querySelector<HTMLCanvasElement>("canvas");
    if (label) label.textContent = String(camera.name ?? id);
    if (canvas) {
      canvas.dataset.cameraId = id;
    }
  }
  updateWorldPreviewCanvases();
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

const sidebarTabBindings = {
  lhs: window.Chem0Shell.bindPaneTabs({
    buttonsSelector: '.tab-btn[data-tab^="lhs:"]',
    initialTab: SIDEBAR_TABS.lhs,
    onActivate: (tab) => {
      SIDEBAR_TABS.lhs = tab;
      if (!workspace.classList.contains("lhs-collapsed")) return;
      workspace.classList.remove("lhs-collapsed");
      updateToggleButtonStates();
    },
    paneRoot: lhsSidebar
  }),
  rhs: window.Chem0Shell.bindPaneTabs({
    buttonsSelector: '.tab-btn[data-tab^="rhs:"]',
    initialTab: SIDEBAR_TABS.rhs,
    onActivate: (tab) => {
      SIDEBAR_TABS.rhs = tab;
      if (!workspace.classList.contains("rhs-collapsed")) return;
      workspace.classList.remove("rhs-collapsed");
      updateToggleButtonStates();
    },
    paneRoot: rhsSidebar
  })
};

function activateTab(tab: string): void {
  const [side] = tab.split(":") as ["lhs" | "rhs"];
  if (side !== "lhs" && side !== "rhs") return;
  sidebarTabBindings[side].activate(tab);
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
  setInterval(updateWorldPreviewCanvases, 5000);
}

document.querySelector("#create-experiment")?.addEventListener("click", () => void createExperimentFromCurrentWorld());

worldSelect.addEventListener("change", () => void selectWorld(worldSelect.value, { matchExperiment: true }));
refreshWorldsBtn.addEventListener("click", async () => {
  await refreshWorlds();
  void refreshRobots();
});

experimentPickerButton.addEventListener("click", () => {
  const nextHidden = !experimentPickerMenu.hidden ? true : false;
  closeAppbarMenus();
  experimentPickerMenu.hidden = nextHidden;
  experimentPickerButton.setAttribute("aria-expanded", String(!nextHidden));
});

worldPickerButton.addEventListener("click", () => {
  const nextHidden = !worldPickerMenu.hidden ? true : false;
  closeAppbarMenus();
  worldPickerMenu.hidden = nextHidden;
  worldPickerButton.setAttribute("aria-expanded", String(!nextHidden));
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
  if (
    target &&
    !experimentPickerMenu.contains(target) &&
    !experimentPickerButton.contains(target) &&
    !worldPickerMenu.contains(target) &&
    !worldPickerButton.contains(target)
  ) {
    closeAppbarMenus();
  }
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

experimentSelect.addEventListener("change", () => void selectExperiment(experimentSelect.value));

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
window.addEventListener("chem0:virtual-camera-frame", updateWorldPreviewCanvases);

/* --------------------------- toolbar tooltips --------------------------- */

window.Chem0Shell.installToolbarTooltips({
  getSettings: () => window.chem0.getSettings(),
  onSettingsChanged: (handler) => window.chem0.onSettingsChanged(handler)
});

void boot();
