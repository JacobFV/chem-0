import { contextBridge, ipcRenderer } from "electron";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

contextBridge.exposeInMainWorld("chem0", {
  listTools: () => ipcRenderer.invoke("chem0:tools-list"),
  readResource: (uri: string) => ipcRenderer.invoke("chem0:resource-read", uri),
  callTool: (name: string, args: JsonObject = {}) => ipcRenderer.invoke("chem0:tool-call", name, args),
  createExperiment: (name: string, metadata: JsonObject = {}) => ipcRenderer.invoke("chem0:create-experiment", name, metadata),
  listExperiments: () => ipcRenderer.invoke("chem0:list-experiments"),
  listEvents: (experimentId: string) => ipcRenderer.invoke("chem0:list-events", experimentId),
  listArtifacts: (experimentId: string) => ipcRenderer.invoke("chem0:list-artifacts", experimentId),
  sendAgentMessage: (input: JsonObject) => ipcRenderer.invoke("chem0:agent-message", input),
  onAgentEvent: (callback: (event: JsonObject) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: JsonObject) => callback(payload);
    ipcRenderer.on("chem0:agent-event", listener);
    return () => ipcRenderer.removeListener("chem0:agent-event", listener);
  }
});
