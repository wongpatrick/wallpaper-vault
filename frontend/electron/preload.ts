import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    send: (channel: string, data: any) => ipcRenderer.send(channel, data),
    on: (channel: string, func: (...args: any[]) => void) =>
        ipcRenderer.on(channel, (event, ...args) => func(...args)),
    openDirectory: () => ipcRenderer.invoke('open-directory'),
    openPath: (path: string) => ipcRenderer.invoke('open-path', path),
})