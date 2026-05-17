import { contextBridge, ipcRenderer } from "electron";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

contextBridge.exposeInMainWorld("chem0", {
  listTools: () => ipcRenderer.invoke("chem0:tools-list"),
  readResource: (uri: string) => ipcRenderer.invoke("chem0:resource-read", uri),
  readUrdf: () => ipcRenderer.invoke("chem0:urdf-read"),
  callTool: (name: string, args: JsonObject = {}) => ipcRenderer.invoke("chem0:tool-call", name, args),
  createExperiment: (name: string, metadata: JsonObject = {}, worldId?: string) =>
    ipcRenderer.invoke("chem0:create-experiment", name, metadata, worldId),
  listExperiments: () => ipcRenderer.invoke("chem0:list-experiments"),
  listEvents: (experimentId: string) => ipcRenderer.invoke("chem0:list-events", experimentId),
  listArtifacts: (experimentId: string) => ipcRenderer.invoke("chem0:list-artifacts", experimentId),
  sendAgentMessage: (input: JsonObject) => ipcRenderer.invoke("chem0:agent-message", input),
  openCalibrationWindow: () => ipcRenderer.invoke("chem0:open-calibration-window"),
  openRecordWindow: () => ipcRenderer.invoke("chem0:open-record-window"),
  openTrainWindow: () => ipcRenderer.invoke("chem0:open-train-window"),
  openReplayWindow: () => ipcRenderer.invoke("chem0:open-replay-window"),
  openSettingsWindow: () => ipcRenderer.invoke("chem0:open-settings-window"),
  openWorkbenchWindow: (tab?: string) => ipcRenderer.invoke("chem0:open-workbench-window", tab),
  detachWorkbenchTab: (tab: string) => ipcRenderer.invoke("chem0:detach-workbench-tab", tab),
  onWorkbenchSetTab: (callback: (payload: { tab: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { tab: string }) => callback(payload);
    ipcRenderer.on("chem0:workbench-set-tab", listener);
    return () => ipcRenderer.removeListener("chem0:workbench-set-tab", listener);
  },
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke("chem0:get-settings"),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke("chem0:set-setting", key, value),
  onSettingsChanged: (callback: (settings: JsonObject) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: JsonObject) => callback(payload);
    ipcRenderer.on("chem0:settings-changed", listener);
    return () => ipcRenderer.removeListener("chem0:settings-changed", listener);
  },
  onAgentEvent: (callback: (event: JsonObject) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: JsonObject) => callback(payload);
    ipcRenderer.on("chem0:agent-event", listener);
    return () => ipcRenderer.removeListener("chem0:agent-event", listener);
  }
});
