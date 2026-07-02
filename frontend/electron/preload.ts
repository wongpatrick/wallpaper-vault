/**
 * @file
 * Electron preload script.
 * Exposes securely selected IPC mechanisms and desktop-native 
 * functionalities to the frontend renderer process.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';

let mockImportPath: string | null = null;

contextBridge.exposeInMainWorld('electron', {
    send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
    on: (channel: string, func: (...args: unknown[]) => void) => {
        const subscription = (_event: unknown, ...args: unknown[]) => func(...args);
        ipcRenderer.on(channel, subscription);
        return () => {
            ipcRenderer.removeListener(channel, subscription);
        };
    },
    openDirectory: () => ipcRenderer.invoke('open-directory'),
    openPath: (path: string) => ipcRenderer.invoke('open-path', path),
    getLoginSettings: () => ipcRenderer.invoke('get-login-item-settings'),
    setLoginSettings: (openAtLogin: boolean) => ipcRenderer.invoke('set-login-item-settings', openAtLogin),
    setMockImportPath: (path: string) => { mockImportPath = path; },
    getPathForFile: (file: File) => mockImportPath || (file as File & { path?: string }).path || webUtils.getPathForFile(file),
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('is-maximized'),
    getCloseBehavior: () => ipcRenderer.invoke('get-close-behavior'),
    setCloseBehavior: (behavior: 'minimize' | 'exit') => ipcRenderer.invoke('set-close-behavior', behavior),
    getBackendStatus: () => ipcRenderer.invoke('get-backend-status'),
    restartBackend: () => ipcRenderer.invoke('restart-backend'),
    setBackendPort: (port: number) => ipcRenderer.invoke('set-backend-port', port),
    openBackendLogs: () => ipcRenderer.invoke('open-backend-logs'),
    openLogsDirectory: () => ipcRenderer.invoke('open-logs-directory'),
    platform: process.platform,
})