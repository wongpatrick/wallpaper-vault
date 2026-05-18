export interface ElectronAPI {
    send: (channel: string, data: unknown) => void;
    on: (channel: string, func: (...args: unknown[]) => void) => void;
    openDirectory: () => Promise<string | null>;
    openPath: (path: string) => Promise<{ success: boolean; error?: string }>;
    getLoginSettings: () => Promise<boolean>;
    setLoginSettings: (openAtLogin: boolean) => Promise<boolean>;
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}
