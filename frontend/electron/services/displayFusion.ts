/**
 * @file
 * DisplayFusion integration service.
 * Manages CLI path discovery (custom, registry, default locations),
 * running-state detection, and robust command execution with timeout and throttled notifications.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile as nodeExecFile } from 'node:child_process';
import { Notification } from 'electron';
import { readWindowSettings } from './appContext';
import { psDaemon } from './powerShellDaemon';

export type DisplayFusionSource = 'custom' | 'registry' | 'default' | null;

export interface DisplayFusionStatus {
    supported: boolean;
    installed: boolean;
    running: boolean;
    exePath: string | null;
    source: DisplayFusionSource;
}

export interface DisplayFusionDeps {
    platform?: string;
    fileExists?: (path: string) => Promise<boolean>;
    runPowerShell?: (script: string) => Promise<string>;
    execFile?: (
        file: string,
        args: string[],
        options: { timeout?: number; windowsHide?: boolean },
        callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => void;
    showNotification?: (title: string, body: string) => void;
    log?: (msg: string) => Promise<void> | void;
    now?: () => number;
    getCustomPath?: () => Promise<string | null>;
}

const DEFAULT_DF_PATHS = [
    'C:\\Program Files\\DisplayFusion\\DisplayFusionCommand.exe',
    'C:\\Program Files (x86)\\DisplayFusion\\DisplayFusionCommand.exe'
];

const NOTIFICATION_THROTTLE_MS = 60000;
const CLI_TIMEOUT_MS = 10000;

export class DisplayFusionService {
    private deps: Required<DisplayFusionDeps>;
    private cachedResolution: { exePath: string; source: DisplayFusionSource } | null = null;
    private lastNotificationTime = 0;

    constructor(deps?: DisplayFusionDeps) {
        this.deps = {
            platform: deps?.platform ?? process.platform,
            fileExists: deps?.fileExists ?? (async (p: string) => {
                try {
                    await fs.promises.access(p, fs.constants.F_OK);
                    return true;
                } catch {
                    return false;
                }
            }),
            runPowerShell: deps?.runPowerShell ?? ((script: string) => psDaemon.run(script)),
            execFile: deps?.execFile ?? ((file, args, opts, cb) => nodeExecFile(file, args, opts, cb)),
            showNotification: deps?.showNotification ?? ((title: string, body: string) => {
                try {
                    if (Notification.isSupported()) {
                        new Notification({ title, body, silent: false }).show();
                    }
                } catch (err) {
                    console.error('[DisplayFusion] Failed to show notification:', err);
                }
            }),
            log: deps?.log ?? ((msg: string) => {
                console.log(msg);
            }),
            now: deps?.now ?? (() => Date.now()),
            getCustomPath: deps?.getCustomPath ?? (async () => {
                try {
                    const settings = await readWindowSettings();
                    const val = settings.displayFusionExePath;
                    return typeof val === 'string' && val.trim().length > 0 ? val.trim() : null;
                } catch {
                    return null;
                }
            })
        };
    }

    public invalidate(): void {
        this.cachedResolution = null;
    }

    public async resolveExePath(): Promise<{ exePath: string | null; source: DisplayFusionSource }> {
        if (this.deps.platform !== 'win32') {
            return { exePath: null, source: null };
        }

        if (this.cachedResolution) {
            // Verify cached file still exists
            const stillExists = await this.deps.fileExists(this.cachedResolution.exePath);
            if (stillExists) {
                return this.cachedResolution;
            }
            this.cachedResolution = null;
        }

        // 1. Custom user path
        const customPath = await this.deps.getCustomPath();
        if (customPath) {
            if (await this.deps.fileExists(customPath)) {
                this.cachedResolution = { exePath: customPath, source: 'custom' };
                return this.cachedResolution;
            }
        }

        // 2. Windows registry via PowerShell
        const registryExe = await this.lookupFromRegistry();
        if (registryExe && (await this.deps.fileExists(registryExe))) {
            this.cachedResolution = { exePath: registryExe, source: 'registry' };
            return this.cachedResolution;
        }

        // 3. Default known installation paths
        for (const defaultPath of DEFAULT_DF_PATHS) {
            if (await this.deps.fileExists(defaultPath)) {
                this.cachedResolution = { exePath: defaultPath, source: 'default' };
                return this.cachedResolution;
            }
        }

        return { exePath: null, source: null };
    }

    private async lookupFromRegistry(): Promise<string | null> {
        try {
            const script = `
$keys = @(
    "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
    "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
)
$entry = Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*DisplayFusion*" } | Select-Object -First 1
if ($entry -and $entry.InstallLocation) {
    Write-Output $entry.InstallLocation
}
`.trim();
            const raw = await this.deps.runPowerShell(script);
            const installLocation = raw.trim();
            if (installLocation) {
                return path.join(installLocation, 'DisplayFusionCommand.exe');
            }
        } catch (err) {
            console.warn('[DisplayFusion] Registry query failed:', err);
        }
        return null;
    }

    public async isRunning(): Promise<boolean> {
        if (this.deps.platform !== 'win32') {
            return false;
        }
        try {
            const raw = await this.deps.runPowerShell('[bool](Get-Process DisplayFusion -ErrorAction SilentlyContinue)');
            return raw.trim().toLowerCase() === 'true';
        } catch {
            return false;
        }
    }

    public async getStatus(): Promise<DisplayFusionStatus> {
        const supported = this.deps.platform === 'win32';
        if (!supported) {
            return {
                supported: false,
                installed: false,
                running: false,
                exePath: null,
                source: null
            };
        }

        const { exePath, source } = await this.resolveExePath();
        const running = await this.isRunning();

        return {
            supported: true,
            installed: Boolean(exePath),
            running,
            exePath,
            source
        };
    }

    public async nextImage(): Promise<boolean> {
        const { exePath } = await this.resolveExePath();
        if (!exePath) {
            const msg = 'DisplayFusion executable (DisplayFusionCommand.exe) not found.';
            await this.deps.log(`[DisplayFusion] ${msg}`);
            this.notifyThrottled('DisplayFusion Skip Failed', msg);
            return false;
        }

        await this.deps.log(`[DisplayFusion] Executing skip: "${exePath}" -WallpaperNextImage`);

        return new Promise<boolean>((resolve) => {
            try {
                this.deps.execFile(
                    exePath,
                    ['-WallpaperNextImage'],
                    { timeout: CLI_TIMEOUT_MS, windowsHide: true },
                    (err) => {
                        if (err) {
                            const errMsg = `CLI command failed: ${err.message}`;
                            void this.deps.log(`[DisplayFusion] ${errMsg}`);
                            this.notifyThrottled('DisplayFusion Skip Failed', errMsg);
                            resolve(false);
                        } else {
                            void this.deps.log('[DisplayFusion] CLI skip completed successfully.');
                            resolve(true);
                        }
                    }
                );
            } catch (syncErr) {
                const errMsg = `CLI command failed synchronously: ${String(syncErr)}`;
                void this.deps.log(`[DisplayFusion] ${errMsg}`);
                this.notifyThrottled('DisplayFusion Skip Failed', errMsg);
                resolve(false);
            }
        });
    }

    private notifyThrottled(title: string, body: string): void {
        const now = this.deps.now();
        if (now - this.lastNotificationTime >= NOTIFICATION_THROTTLE_MS) {
            this.lastNotificationTime = now;
            this.deps.showNotification(title, body);
        }
    }
}

export const displayFusionService = new DisplayFusionService();
