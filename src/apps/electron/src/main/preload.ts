import { contextBridge, ipcRenderer } from "electron";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

contextBridge.exposeInMainWorld("chem0", {
  listTools: () => ipcRenderer.invoke("chem0:tools-list"),
  readResource: (uri: string) => ipcRenderer.invoke("chem0:resource-read", uri),
  callTool: (name: string, args: JsonObject = {}) => ipcRenderer.invoke("chem0:tool-call", name, args)
});
