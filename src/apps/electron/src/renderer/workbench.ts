export {};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

window.Chem0Shell.applyPlatformClass(window.chem0?.platform);

const params = new URLSearchParams(window.location.search);
const initialTabRaw = (params.get("tab") ?? "record").toLowerCase();
const detached = params.get("detached") === "1";

if (detached) document.body.classList.add("workbench-detached");

const VALID_TABS = ["record", "train", "replay"] as const;
type TabName = (typeof VALID_TABS)[number];

function isTab(value: string): value is TabName {
  return (VALID_TABS as readonly string[]).includes(value);
}

const statusTextEl = document.querySelector<HTMLSpanElement>("#wb-status-text");
const statusPillEl = document.querySelector<HTMLDivElement>("#wb-status-pill");

let currentTab: TabName = isTab(initialTabRaw) ? initialTabRaw : "record";

const tabBinding = window.Chem0Shell.bindPaneTabs({
  buttonsSelector: ".appbar .tab-btn",
  initialTab: currentTab,
  onActivate: (tab) => {
    if (!isTab(tab)) return;
    currentTab = tab;
    if (statusTextEl) statusTextEl.textContent = tab;
    if (statusPillEl) statusPillEl.classList.toggle("active", true);
  },
  validate: isTab
});

function activateTab(tab: TabName): void {
  tabBinding.activate(tab);
}

if (detached) {
  for (const btn of tabBinding.buttons) {
    if (btn.dataset.tab !== currentTab) btn.style.display = "none";
  }
}

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

window.Chem0Shell.installThemeSync({
  getSettings: () => window.chem0.getSettings(),
  onSettingsChanged: (handler) => window.chem0.onSettingsChanged(handler)
});

window.Chem0Shell.installToolbarTooltips({
  getSettings: () => window.chem0.getSettings(),
  onSettingsChanged: (handler) => window.chem0.onSettingsChanged(handler)
});

/* the ?: silences ts unused warnings on JsonValue when no params consumed */
void (null as JsonValue);
