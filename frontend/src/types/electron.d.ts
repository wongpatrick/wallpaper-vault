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

export interface ElectronAPI {
    send: (channel: string, data: unknown) => void;
    on: (channel: string, func: (...args: unknown[]) => void) => () => void;
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
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}

