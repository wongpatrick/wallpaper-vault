export interface ElectronAPI {
    send: (channel: string, data: any) => void;
    on: (channel: string, func: (...args: any[]) => void) => void;
    openDirectory: () => Promise<string | null>;
    openPath: (path: string) => Promise<void>;
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}
