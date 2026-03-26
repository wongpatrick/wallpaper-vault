import { contextBridge, ipcRenderer } from "electron";
//#region electron/preload.ts
contextBridge.exposeInMainWorld("electron", {
	send: (channel, data) => ipcRenderer.send(channel, data),
	on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args))
});
//#endregion
