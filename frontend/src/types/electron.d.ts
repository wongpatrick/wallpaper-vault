/**
 * @file
 * TypeScript definitions for Electron inter-process communication API.
 * Declares the global Window interface for Electron bindings.
 */
export interface BackendStatusInfo {
    status: 'starting' | 'running' | 'stopped' | 'port-collision' | 'error';
    autoRestartCount: number;
    maxRestarts: number;
    port: number;
    errorDetails?: string;
}

export interface MonitorInfo {
    index: number;
    winNum?: number;
    id: number;
    label: string;
    bounds: { width: number; height: number; x: number; y: number; };
}

export interface VaultEntry {
    id: string;
    label: string;
    url: string;
    apiKey?: string;
    isLocal: boolean;
    status?: 'online' | 'offline' | 'unauthorized';
    lastSeen?: string;
    vaultId?: string;
    vaultName?: string;
    version?: string;
}

export interface VaultRegistryData {
    activeVaultId: string;
    vaults: VaultEntry[];
}

export interface TestConnectionResult {
    success: boolean;
    status: 'online' | 'offline' | 'unauthorized';
    vaultId?: string;
    vaultName?: string;
    version?: string;
    error?: string;
}

export interface ElectronAPI {
    onWindowMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
    onBackendStatusChange: (callback: (status: BackendStatusInfo) => void) => () => void;
    onVaultRegistryUpdated: (callback: (data: VaultRegistryData) => void) => () => void;
    onDisplaysChanged: (callback: () => void) => () => void;
    openDirectory: () => Promise<string | null>;
    openPath: (path: string) => Promise<{ success: boolean; error?: string }>;
    getLoginSettings: () => Promise<boolean>;
    setLoginSettings: (openAtLogin: boolean) => Promise<boolean>;
    setMockImportPath?: (path: string) => void;
    getPathForFile: (file: File) => string;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    getCloseBehavior: () => Promise<'minimize' | 'exit'>;
    setCloseBehavior: (behavior: 'minimize' | 'exit') => Promise<boolean>;
    platform: string;
    getBackendStatus: () => Promise<BackendStatusInfo>;
    restartBackend: () => Promise<boolean>;
    setBackendPort: (port: number) => Promise<boolean>;
    openBackendLogs: () => Promise<boolean>;
    openLogsDirectory: () => Promise<boolean>;
    getMonitors: (forceRefresh?: boolean) => Promise<MonitorInfo[]>;
    getSystemWallpapers: () => Promise<Array<{ comIndex: number; wallpaper: string }>>;
    setWallpaper: (imageId: number, monitorIndex: number, style: string) => Promise<{ success: boolean; error?: string }>;
    getVaultRegistry: () => Promise<VaultRegistryData>;
    getActiveVault: () => Promise<VaultEntry>;
    setActiveVault: (vaultId: string) => Promise<VaultEntry>;
    addVault: (payload: { label: string; url: string; apiKey?: string }) => Promise<VaultEntry>;
    updateVault: (id: string, updates: Partial<{ label: string; url: string; apiKey: string }>) => Promise<VaultEntry>;
    removeVault: (id: string) => Promise<VaultRegistryData>;
    testVaultConnection: (url: string, apiKey?: string) => Promise<TestConnectionResult>;
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}
