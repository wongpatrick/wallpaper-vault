/**
 * @file
 * TypeScript definitions for Electron inter-process communication API.
 * Declares the global Window interface for Electron bindings.
 */
export interface ElectronAPI {
    send: (channel: string, data: unknown) => void;
    on: (channel: string, func: (...args: unknown[]) => void) => void;
    openDirectory: () => Promise<string | null>;
    openPath: (path: string) => Promise<{ success: boolean; error?: string }>;
    getLoginSettings: () => Promise<boolean>;
    setLoginSettings: (openAtLogin: boolean) => Promise<boolean>;
    getPathForFile: (file: File) => string;
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}
