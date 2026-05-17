export {};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

document.body.classList.add(`platform-${window.chem0?.platform ?? "darwin"}`);

const params = new URLSearchParams(window.location.search);
const initialTabRaw = (params.get("tab") ?? "record").toLowerCase();
const detached = params.get("detached") === "1";

if (detached) document.body.classList.add("workbench-detached");

const VALID_TABS = ["record", "train", "replay"] as const;
type TabName = (typeof VALID_TABS)[number];

function isTab(value: string): value is TabName {
  return (VALID_TABS as readonly string[]).includes(value);
}

const panes = new Map<TabName, HTMLElement>();
for (const pane of document.querySelectorAll<HTMLElement>(".sidebar-pane")) {
  const t = pane.dataset.tab ?? "";
  if (isTab(t)) panes.set(t, pane);
}

const tabButtons = new Map<TabName, HTMLButtonElement>();
for (const btn of document.querySelectorAll<HTMLButtonElement>(".appbar .tab-btn")) {
  const t = btn.dataset.tab ?? "";
  if (isTab(t)) tabButtons.set(t, btn);
}

const statusTextEl = document.querySelector<HTMLSpanElement>("#wb-status-text");
const statusPillEl = document.querySelector<HTMLDivElement>("#wb-status-pill");

let currentTab: TabName = isTab(initialTabRaw) ? initialTabRaw : "record";

function activateTab(tab: TabName): void {
  currentTab = tab;
  for (const [name, pane] of panes) pane.classList.toggle("active", name === tab);
  for (const [name, btn] of tabButtons) btn.classList.toggle("active", name === tab);
  if (statusTextEl) statusTextEl.textContent = tab;
  if (statusPillEl) statusPillEl.classList.toggle("active", true);
}

for (const [name, btn] of tabButtons) {
  btn.addEventListener("click", () => activateTab(name));
}

if (detached) {
  for (const [name, btn] of tabButtons) {
    if (name !== currentTab) btn.style.display = "none";
  }
}

activateTab(currentTab);

document.querySelector<HTMLButtonElement>("#wb-detach")?.addEventListener("click", async () => {
  await window.chem0.detachWorkbenchTab(currentTab);
});
document.querySelector<HTMLButtonElement>("#wb-open-settings")?.addEventListener("click", async () => {
  await window.chem0.openSettingsWindow();
});

window.chem0.onWorkbenchSetTab?.(({ tab }) => {
  if (isTab(tab)) activateTab(tab);
});

/* Eager-load every module script.  The 3D leader/follower views in the
   main area are always visible, so record3d.mjs needs to be running
   continuously to poll robot poses.  train.js / replay.js are cheap to
   load and only attach listeners + an initial checkpoint fetch. */
function injectScript(src: string, asModule = false): void {
  const script = document.createElement("script");
  if (asModule) script.type = "module";
  script.src = src;
  document.body.appendChild(script);
}
injectScript("./record3d.mjs", true);
injectScript("./train.js");
injectScript("./replay.js");

/* tooltips — mirror the main window behavior */

const tooltipEl = document.createElement("div");
tooltipEl.className = "tooltip";
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

/* the ?: silences ts unused warnings on JsonValue when no params consumed */
void (null as JsonValue);
