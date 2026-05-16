import { app, BrowserWindow, ipcMain, Menu, session } from "electron";
import path from "node:path";
import { Chem0Backend, type JsonObject } from "@chem0/backend";

const repoRoot = path.resolve(__dirname, "../../../../..");
const backend = new Chem0Backend(repoRoot);
const windows = new Set<BrowserWindow>();
const APP_NAME = "Chem-0 Lab Console";

app.setName(APP_NAME);

function installApplicationMenu(): void {
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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1040,
    minHeight: 720,
    title: APP_NAME,
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
      nodeIntegration: false
    }
  });
  windows.add(win);
  win.on("closed", () => windows.delete(win));
  void win.loadFile(path.join(__dirname, "../renderer/calibration.html"));
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
ipcMain.handle("chem0:tool-call", async (_event, name: string, args: JsonObject) => backend.callTool(name, args));
ipcMain.handle("chem0:create-experiment", async (_event, name: string, metadata: JsonObject = {}) =>
  backend.createExperiment(name, metadata)
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
