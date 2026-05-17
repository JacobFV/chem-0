import { app, BrowserWindow, ipcMain, Menu, session } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Chem0Backend, type JsonObject } from "@chem0/backend";

const repoRoot = path.resolve(__dirname, "../../../../..");
const backend = new Chem0Backend(repoRoot);
const windows = new Set<BrowserWindow>();
const APP_NAME = "Chem-0 Lab Console";

const settingsPath = path.join(repoRoot, "data", "settings.json");
const settingsDefaults: JsonObject = { showToolbarTooltips: true };
let settingsState: JsonObject = { ...settingsDefaults };
try {
  const raw = fs.readFileSync(settingsPath, "utf8");
  settingsState = { ...settingsDefaults, ...(JSON.parse(raw) as JsonObject) };
} catch { /* file may not exist yet */ }

function persistSettings(): void {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settingsState, null, 2));
  } catch (err) {
    console.error("Failed to persist settings", err);
  }
}

function broadcastSettings(): void {
  for (const win of windows) {
    if (!win.isDestroyed()) win.webContents.send("chem0:settings-changed", settingsState);
  }
}

function applyApplicationName(): void {
  app.name = APP_NAME;
  app.setName(APP_NAME);
}

applyApplicationName();

function installApplicationMenu(): void {
  applyApplicationName();
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        { role: "about", label: `About ${APP_NAME}` },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide", label: `Hide ${APP_NAME}` },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: `Quit ${APP_NAME}` }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }]
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendAgentEvent(event: unknown): void {
  for (const win of windows) {
    if (!win.isDestroyed()) win.webContents.send("chem0:agent-event", event);
  }
}

function platformTitleBarOptions(): Partial<Electron.BrowserWindowConstructorOptions> {
  if (process.platform === "darwin") {
    return { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 14 } };
  }
  return {
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#000000", symbolColor: "#a8a8a8", height: 36 }
  };
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1040,
    minHeight: 720,
    title: APP_NAME,
    ...platformTitleBarOptions(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  windows.add(win);
  win.on("closed", () => windows.delete(win));
  void win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

function createSettingsWindow(): void {
  const win = new BrowserWindow({
    width: 560,
    height: 460,
    minWidth: 420,
    minHeight: 320,
    title: `${APP_NAME} Settings`,
    ...platformTitleBarOptions(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  windows.add(win);
  win.on("closed", () => windows.delete(win));
  void win.loadFile(path.join(__dirname, "../renderer/settings.html"));
}

function createCalibrationWindow(): void {
  const win = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    title: `${APP_NAME} Calibration`,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });
  windows.add(win);
  win.on("closed", () => windows.delete(win));
  void win.loadFile(path.join(__dirname, "../renderer/calibration.html"));
}

type WorkbenchTab = "record" | "train" | "replay";
let workbenchWindow: BrowserWindow | null = null;

function workbenchTitle(tab: WorkbenchTab, detached: boolean): string {
  const label = tab.charAt(0).toUpperCase() + tab.slice(1);
  return detached ? `${APP_NAME} ${label}` : `${APP_NAME} Workbench`;
}

function createWorkbenchWindow(opts: { tab: WorkbenchTab; detached: boolean }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: workbenchTitle(opts.tab, opts.detached),
    ...platformTitleBarOptions(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });
  windows.add(win);
  win.on("closed", () => {
    windows.delete(win);
    if (workbenchWindow === win) workbenchWindow = null;
  });
  void win.loadFile(path.join(__dirname, "../renderer/workbench.html"), {
    search: `tab=${opts.tab}${opts.detached ? "&detached=1" : ""}`
  });
  return win;
}

function openOrFocusWorkbench(tab: WorkbenchTab): BrowserWindow {
  if (workbenchWindow && !workbenchWindow.isDestroyed()) {
    workbenchWindow.webContents.send("chem0:workbench-set-tab", { tab });
    workbenchWindow.setTitle(workbenchTitle(tab, false));
    if (workbenchWindow.isMinimized()) workbenchWindow.restore();
    workbenchWindow.focus();
    return workbenchWindow;
  }
  workbenchWindow = createWorkbenchWindow({ tab, detached: false });
  return workbenchWindow;
}

app.whenReady().then(async () => {
  installApplicationMenu();
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    copyright: "Local chem-0 research project"
  });
  backend.on("stderr", (text) => console.error(`[chem-0 python] ${text}`));
  backend.on("agent-event", sendAgentEvent);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  await backend.init();
  createWindow();
});

app.on("window-all-closed", () => {
  backend.stop();
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("chem0:tools-list", async () => backend.listTools());
ipcMain.handle("chem0:resource-read", async (_event, uri: string) => backend.readResource(uri));
ipcMain.handle("chem0:urdf-read", async () => ({
  path: path.join(repoRoot, "assets/kinematics/so101_kinematics.urdf"),
  text: fs.readFileSync(path.join(repoRoot, "assets/kinematics/so101_kinematics.urdf"), "utf8")
}));
ipcMain.handle("chem0:tool-call", async (_event, name: string, args: JsonObject) => backend.callTool(name, args));
ipcMain.handle("chem0:create-experiment", async (_event, name: string, metadata: JsonObject = {}, worldId?: string) =>
  backend.createExperiment(name, metadata, typeof worldId === "string" && worldId.trim() ? worldId : undefined)
);
ipcMain.handle("chem0:list-experiments", async () => ({ experiments: backend.listExperiments() as unknown as JsonObject[] }));
ipcMain.handle("chem0:list-events", async (_event, experimentId: string) => ({
  events: backend.store.listEvents(experimentId) as unknown as JsonObject[]
}));
ipcMain.handle("chem0:list-artifacts", async (_event, experimentId: string) => ({
  artifacts: backend.store.listArtifacts(experimentId)
}));
ipcMain.handle("chem0:agent-message", async (_event, input: JsonObject) => {
  void backend.streamAgentMessage({
    experimentId: String(input.experiment_id),
    sessionId: typeof input.session_id === "string" ? input.session_id : undefined,
    message: String(input.message ?? ""),
    model: typeof input.model === "string" ? input.model : undefined
  });
  return { accepted: true };
});
ipcMain.handle("chem0:open-calibration-window", async () => {
  createCalibrationWindow();
  return { opened: true };
});

ipcMain.handle("chem0:open-record-window", async () => {
  openOrFocusWorkbench("record");
  return { opened: true };
});

ipcMain.handle("chem0:open-train-window", async () => {
  openOrFocusWorkbench("train");
  return { opened: true };
});

ipcMain.handle("chem0:open-replay-window", async () => {
  openOrFocusWorkbench("replay");
  return { opened: true };
});

ipcMain.handle("chem0:open-workbench-window", async (_event, tab: string = "record") => {
  const normalized: WorkbenchTab = tab === "train" || tab === "replay" ? tab : "record";
  openOrFocusWorkbench(normalized);
  return { opened: true };
});

ipcMain.handle("chem0:detach-workbench-tab", async (_event, tab: string) => {
  const normalized: WorkbenchTab = tab === "train" || tab === "replay" ? tab : "record";
  createWorkbenchWindow({ tab: normalized, detached: true });
  return { detached: true };
});

ipcMain.handle("chem0:open-settings-window", async () => {
  createSettingsWindow();
  return { opened: true };
});

ipcMain.handle("chem0:get-settings", async () => settingsState);

ipcMain.handle("chem0:set-setting", async (_event, key: string, value: unknown) => {
  settingsState = { ...settingsState, [key]: value as never };
  persistSettings();
  broadcastSettings();
  return settingsState;
});
