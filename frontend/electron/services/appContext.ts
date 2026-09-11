/**
 * @file
 * Application context and shared configuration for Electron main process.
 * Provides async settings persistence, logging, port management, and state interfaces.
 */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export const DEFAULT_PORT = 8000;
export const STARTUP_TIMEOUT_MS = 20000;
export const HEARTBEAT_STARTUP_INTERVAL_MS = 5000;
export const HEARTBEAT_RUNNING_INTERVAL_MS = 60000;
export const PING_TIMEOUT_MS = 2000;
export const RESTART_ATTEMPT_DELAY_MS = 2000;
export const RESTART_MANUAL_DELAY_MS = 500;
export const HTTP_STATUS_OK = 200;
export const HTTP_DEFAULT_PORT = 80;
export const HTTPS_DEFAULT_PORT = 443;
export const MAX_AUTO_RESTARTS = 3;

export interface BackendStatusInfo {
    status: 'starting' | 'running' | 'stopped' | 'port-collision' | 'error';
    autoRestartCount: number;
    maxRestarts: number;
    port: number;
    errorDetails?: string;
}

export interface AppContext {
    getMainWindow: () => BrowserWindow | null;
    getBackendPort: () => number;
    isQuitting: () => boolean;
    setQuitting: (v: boolean) => void;
    logToCombined: (msg: string) => Promise<void>;
}

let cachedBackendPort: number | null = null;

function getSettingsPath(): string {
    return path.join(app.getPath('userData'), 'window-settings.json');
}

export async function readWindowSettings(): Promise<Record<string, unknown>> {
    try {
        const settingsPath = getSettingsPath();
        const raw = await fs.promises.readFile(settingsPath, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

export async function writeWindowSettings(settings: Record<string, unknown>): Promise<boolean> {
    try {
        const settingsPath = getSettingsPath();
        await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('Failed to save window settings:', err);
        return false;
    }
}

export async function loadInitialSettings(): Promise<void> {
    try {
        const settings = await readWindowSettings();
        if (settings.backendPort && !isNaN(Number(settings.backendPort))) {
            cachedBackendPort = parseInt(String(settings.backendPort), 10);
        }
    } catch {
        // Fallback to default
    }
}

export function getBackendPort(): number {
    if (process.env.VITE_API_BASE_URL) {
        try {
            const url = new URL(process.env.VITE_API_BASE_URL);
            if (url.port) return parseInt(url.port, 10);
        } catch {
            // ignore
        }
    }
    return cachedBackendPort ?? DEFAULT_PORT;
}

export async function setBackendPortSetting(port: number): Promise<boolean> {
    cachedBackendPort = port;
    try {
        const settings = await readWindowSettings();
        settings.backendPort = port;
        await writeWindowSettings(settings);
        await logBothToCombined(`Backend port updated in settings to ${port}`);
        return true;
    } catch (err) {
        console.error('Failed to save backend port:', err);
        return false;
    }
}

export async function logBoth(logFilePath: string, msg: string): Promise<void> {
    console.log(msg);
    try {
        await fs.promises.appendFile(logFilePath, `[Electron] [${new Date().toISOString()}] ${msg}\n`);
    } catch {
        // ignore
    }
}

export async function logBothToCombined(msg: string): Promise<void> {
    console.log(msg);
    try {
        const userDataPath = app.getPath('userData');
        const logsDir = path.join(userDataPath, 'logs');
        await fs.promises.mkdir(logsDir, { recursive: true });
        const logFilePath = path.join(logsDir, 'combined.log');
        await fs.promises.appendFile(logFilePath, `[Electron] [${new Date().toISOString()}] ${msg}\n`);
    } catch {
        // ignore
    }
}
