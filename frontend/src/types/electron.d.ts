export interface ElectronAPI {
    send: (channel: string, data: any) => void;
    on: (channel: string, func: (...args: any[]) => void) => void;
    openDirectory: () => Promise<string | null>;
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}
