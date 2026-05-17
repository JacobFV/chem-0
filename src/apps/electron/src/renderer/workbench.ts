export {};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

document.body.classList.add(`platform-${window.chem0?.platform ?? "darwin"}`);

const params = new URLSearchParams(window.location.search);
const initialTab = (params.get("tab") ?? "record").toLowerCase();
const detached = params.get("detached") === "1";

if (detached) document.body.classList.add("workbench-detached");

const statusTextEl = document.querySelector<HTMLSpanElement>("#wb-status-text");
const statusPillEl = document.querySelector<HTMLDivElement>("#wb-status-pill");

function setStatus(text: string, active = false): void {
  if (statusTextEl) statusTextEl.textContent = text;
  if (statusPillEl) statusPillEl.classList.toggle("active", active);
}

const VALID_TABS = ["record", "train", "replay"] as const;
type TabName = (typeof VALID_TABS)[number];

function isTab(tab: string): tab is TabName {
  return (VALID_TABS as readonly string[]).includes(tab);
}

const panes = new Map<TabName, HTMLElement>();
for (const pane of document.querySelectorAll<HTMLElement>(".workbench-pane")) {
  const t = pane.dataset.tab ?? "";
  if (isTab(t)) panes.set(t, pane);
}

const tabButtons = new Map<TabName, HTMLButtonElement>();
for (const btn of document.querySelectorAll<HTMLButtonElement>(".appbar .tab-btn")) {
  const t = btn.dataset.tab ?? "";
  if (isTab(t)) tabButtons.set(t, btn);
}

const loadedModules = new Set<TabName>();

function injectScript(src: string, isModule = false): void {
  const script = document.createElement("script");
  if (isModule) script.type = "module";
  script.src = src;
  document.body.appendChild(script);
}

function loadModule(tab: TabName): void {
  if (loadedModules.has(tab)) return;
  loadedModules.add(tab);
  if (tab === "record") injectScript("./record3d.mjs", true);
  else if (tab === "train") injectScript("./train.js");
  else if (tab === "replay") injectScript("./replay.js");
}

let currentTab: TabName = isTab(initialTab) ? initialTab : "record";

function activateTab(tab: TabName): void {
  currentTab = tab;
  for (const [name, pane] of panes) pane.hidden = name !== tab;
  for (const [name, btn] of tabButtons) btn.classList.toggle("active", name === tab);
  loadModule(tab);
  setStatus(tab, true);
}

for (const [name, btn] of tabButtons) {
  btn.addEventListener("click", () => activateTab(name));
}

if (detached) {
  // In detached mode hide all tab buttons except the active one (it stays as a label).
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

if (window.chem0.onWorkbenchSetTab) {
  window.chem0.onWorkbenchSetTab(({ tab }) => {
    if (isTab(tab)) activateTab(tab);
  });
}

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
