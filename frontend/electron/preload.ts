/**
 * @file
 * Electron preload script.
 * Exposes securely selected IPC mechanisms and desktop-native 
 * functionalities to the frontend renderer process.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';

let mockImportPath: string | null = null;

contextBridge.exposeInMainWorld('electron', {
    onWindowMaximizedChange: (callback: (isMaximized: boolean) => void) => {
        const subscription = (_event: unknown, isMaximized: boolean) => callback(isMaximized);
        ipcRenderer.on('window-maximized-change', subscription);
        return () => {
            ipcRenderer.removeListener('window-maximized-change', subscription);
        };
    },
    onBackendStatusChange: (callback: (status: unknown) => void) => {
        const subscription = (_event: unknown, status: unknown) => callback(status);
        ipcRenderer.on('backend-status-change', subscription);
        return () => {
            ipcRenderer.removeListener('backend-status-change', subscription);
        };
    },
    onVaultRegistryUpdated: (callback: (data: unknown) => void) => {
        const subscription = (_event: unknown, data: unknown) => callback(data);
        ipcRenderer.on('vault-registry-updated', subscription);
        return () => {
            ipcRenderer.removeListener('vault-registry-updated', subscription);
        };
    },
    onDisplaysChanged: (callback: () => void) => {
        const subscription = () => callback();
        ipcRenderer.on('displays-changed', subscription);
        return () => {
            ipcRenderer.removeListener('displays-changed', subscription);
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
    getMonitors: (forceRefresh?: boolean) => ipcRenderer.invoke('get-monitors', forceRefresh),
    getSystemWallpapers: () => ipcRenderer.invoke('get-system-wallpapers'),
    setWallpaper: (imageId: number, monitorIndex: number, style: string) => ipcRenderer.invoke('set-wallpaper', { imageId, monitorIndex, style }),
    getVaultRegistry: () => ipcRenderer.invoke('get-vault-registry'),
    getActiveVault: () => ipcRenderer.invoke('get-active-vault'),
    setActiveVault: (vaultId: string) => ipcRenderer.invoke('set-active-vault', vaultId),
    addVault: (payload: { label: string; url: string; apiKey?: string }) => ipcRenderer.invoke('add-vault', payload),
    updateVault: (id: string, updates: Record<string, unknown>) => ipcRenderer.invoke('update-vault', id, updates),
    removeVault: (id: string) => ipcRenderer.invoke('remove-vault', id),
    testVaultConnection: (url: string, apiKey?: string) => ipcRenderer.invoke('test-vault-connection', url, apiKey),
    platform: process.platform,
})