/**
 * @file
 * Persistent background PowerShell daemon for Windows display and wallpaper manipulation.
 * Manages Win32/COM interop, monitor enumeration, and native wallpaper setting.
 */
/* eslint-disable no-useless-escape, no-magic-numbers */
import { spawn, type ChildProcess } from 'node:child_process';
import { logBothToCombined } from './appContext';

const DEFAULT_COMMAND_TIMEOUT_MS = 15000;
const ERROR_SNIPPET_LENGTH = 50;

export const isNativeWallpaperSupported = process.platform === 'win32';

export function extractJsonArray(stdout: string): string {
    const lines = stdout.split(/\r?\n/);
    const jsonLine = lines.find(line => line.trim().startsWith('[') && line.trim().endsWith(']'));
    return jsonLine ? jsonLine.trim() : '[]';
}

interface TrackedChildProcess extends ChildProcess {
    __isKilledForRespawn?: boolean;
}

export interface PowerShellDaemonOptions {
    timeoutMs?: number;
    autoInit?: boolean;
    isSupported?: boolean;
    spawn?: typeof spawn;
}

export class PowerShellDaemon {
    private process: TrackedChildProcess | null = null;
    private queue: Array<{ cmd: string; resolve: (val: string) => void; reject: (err: Error) => void }> = [];
    private currentCallback: { nonce: string; resolve: (val: string) => void; reject: (err: Error) => void } | null = null;
    private outputBuffer = '';
    private isReady = false;
    private initPromise: Promise<void> | null = null;
    private commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS;
    private supported: boolean;
    private spawnFn: typeof spawn;

    constructor(options?: PowerShellDaemonOptions) {
        this.spawnFn = options?.spawn ?? spawn;
        this.commandTimeoutMs = options?.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
        this.supported = options?.isSupported ?? isNativeWallpaperSupported;
        if (this.supported && (options?.autoInit ?? true)) {
            this.initPromise = this.init().catch((err) => {
                void logBothToCombined(`[PS Daemon] Initial spawn failed: ${err.message}`);
            });
        }
    }

    private init(): Promise<void> {
        return new Promise((resolve, reject) => {
            void logBothToCombined('[PS Daemon] Starting persistent background PowerShell daemon...');
            this.process = this.spawnFn('Powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.process.on('error', (err) => {
                void logBothToCombined(`[PS Daemon] Process failed to spawn: ${err.message}`);
                reject(err);
            });

            const currentProc = this.process;
            currentProc.on('exit', (code, signal) => {
                void logBothToCombined(`[PS Daemon] Process exited with code ${code}, signal ${signal}`);
                const wasReady = this.isReady;
                this.isReady = false;

                if (currentProc.__isKilledForRespawn) {
                    // Intentionally killed to recover from wedged/timed-out state;
                    // the queue will be processed by the respawned process once ready.
                    return;
                }

                const err = new Error(`PowerShell daemon exited with code ${code}, signal ${signal}`);
                if (this.currentCallback) {
                    const cb = this.currentCallback;
                    this.currentCallback = null;
                    cb.reject(err);
                }
                while (this.queue.length > 0) {
                    const task = this.queue.shift();
                    task?.reject(err);
                }

                if (!wasReady) {
                    reject(err);
                }
            });

            this.process.stdout?.on('data', (data) => {
                const str = data.toString();
                void logBothToCombined(`[PS Daemon Stdout] ${str.trim()}`);
                this.outputBuffer += str;
                this.checkOutput();
            });

            this.process.stderr?.on('data', (data) => {
                const str = data.toString();
                void logBothToCombined(`[PS Daemon Stderr] ${str.trim()}`);
                console.error('[PS Daemon Stderr]', str);
            });

            // Keep-alive monitor job: kills PowerShell if the parent Electron process dies unexpectedly
            const csharpCode = [
                'using System;',
                'using System.Collections.Generic;',
                'using System.Runtime.InteropServices;',
                '[StructLayout(LayoutKind.Sequential)]',
                'public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
                '[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]',
                'public struct MonitorInfoEx {',
                '    public int Size;',
                '    public RECT Monitor;',
                '    public RECT Work;',
                '    public uint Flags;',
                '    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]',
                '    public string DeviceName;',
                '}',
                'public class WinDisplayHelper {',
                '    [DllImport("user32.dll", CharSet = CharSet.Auto)]',
                '    public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MonitorInfoEx lpmi);',
                '    private delegate bool MonitorEnumDelegate(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);',
                '    [DllImport("user32.dll")]',
                '    private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumDelegate lpfnEnum, IntPtr dwData);',
                '    public static string GetDisplays() {',
                '        var results = new List<string>();',
                '        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, delegate(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData) {',
                '            MonitorInfoEx mi = new MonitorInfoEx();',
                '            mi.Size = Marshal.SizeOf(mi);',
                '            if (GetMonitorInfo(hMonitor, ref mi)) {',
                '                string winNum = "1";',
                '                var match = System.Text.RegularExpressions.Regex.Match(mi.DeviceName, @"\\d+");',
                '                if (match.Success) {',
                '                    winNum = match.Value;',
                '                }',
                '                results.Add("{" +',
                '                    "\\"winNum\\":" + winNum +',
                '                    ",\\"x\\":" + mi.Monitor.Left +',
                '                    ",\\"y\\":" + mi.Monitor.Top +',
                '                    ",\\"w\\":" + (mi.Monitor.Right - mi.Monitor.Left) +',
                '                    ",\\"h\\":" + (mi.Monitor.Bottom - mi.Monitor.Top) + "}");',
                '            }',
                '            return true;',
                '        }, IntPtr.Zero);',
                '        return "[" + string.Join(",", results) + "]";',
                '    }',
                '}',
                '[ComImport, Guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD")]',
                'public class DesktopWallpaperClass {}',
                '[ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
                '[CoClass(typeof(DesktopWallpaperClass))]',
                'public interface IDesktopWallpaper {',
                '    void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);',
                '    void GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] out string wallpaper);',
                '    void GetMonitorDevicePathAt(uint monitorIndex, [MarshalAs(UnmanagedType.LPWStr)] out string monitorID);',
                '    void GetMonitorDevicePathCount(out uint count);',
                '    void GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitorID, out RECT displayRect);',
                '    void SetBackgroundColor(uint color);',
                '    void GetBackgroundColor(out uint color);',
                '    void SetPosition(int position);',
                '}',
                'public class ComDisplayHelper {',
                '    public static string GetLayout() {',
                '        try {',
                '            IDesktopWallpaper w = (IDesktopWallpaper)new DesktopWallpaperClass();',
                '            uint count = 0;',
                '            w.GetMonitorDevicePathCount(out count);',
                '            var results = new List<string>();',
                '            for (uint i = 0; i < count; i++) {',
                '                try {',
                '                    string id;',
                '                    w.GetMonitorDevicePathAt(i, out id);',
                '                    RECT r;',
                '                    w.GetMonitorRECT(id, out r);',
                '                    results.Add("{" +',
                '                        "\\"comIndex\\":" + i +',
                '                        ",\\"x\\":" + r.Left +',
                '                        ",\\"y\\":" + r.Top +',
                '                        ",\\"w\\":" + (r.Right - r.Left) +',
                '                        ",\\"h\\":" + (r.Bottom - r.Top) + "}");',
                '                } catch {}',
                '            }',
                '            return "[" + string.Join(",", results) + "]";',
                '        } catch { return "[]"; }',
                '    }',
                '}',
                'public class WallpaperHelper {',
                '    public static string GetPaths() {',
                '        try {',
                '            IDesktopWallpaper w = (IDesktopWallpaper)new DesktopWallpaperClass();',
                '            uint count = 0;',
                '            w.GetMonitorDevicePathCount(out count);',
                '            var results = new List<string>();',
                '            for (uint i = 0; i < count; i++) {',
                '                try {',
                '                    string id;',
                '                    w.GetMonitorDevicePathAt(i, out id);',
                '                    string path;',
                '                    w.GetWallpaper(id, out path);',
                '                    results.Add("{\\"comIndex\\":" + i + ",\\"wallpaper\\":\\"" + path.Replace("\\\\", "\\\\\\\\").Replace("\\"", "\\\\\\\"") + "\\"}");',
                '                } catch {}',
                '            }',
                '            return "[" + string.Join(",", results) + "]";',
                '        } catch { return "[]"; }',
                '    }',
                '    public static void SetMonitorWallpaper(int monitorIndex, string path, int position) {',
                '        IDesktopWallpaper w = (IDesktopWallpaper)new DesktopWallpaperClass();',
                '        w.SetPosition(position);',
                '        if (monitorIndex == -1) {',
                '            w.SetWallpaper(null, path);',
                '        } else {',
                '            uint count = 0;',
                '            w.GetMonitorDevicePathCount(out count);',
                '            if ((uint)monitorIndex < count) {',
                '                string id;',
                '                w.GetMonitorDevicePathAt((uint)monitorIndex, out id);',
                '                w.SetWallpaper(id, path);',
                '            }',
                '        }',
                '    }',
                '}',
                'public class FullscreenHelper {',
                '    [DllImport("user32.dll")]',
                '    public static extern IntPtr GetForegroundWindow();',
                '    [DllImport("user32.dll")]',
                '    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);',
                '    [DllImport("user32.dll", CharSet = CharSet.Auto)]',
                '    public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);',
                '    [DllImport("user32.dll")]',
                '    public static extern IntPtr GetShellWindow();',
                '    public static bool IsFullscreen() {',
                '        IntPtr hwnd = GetForegroundWindow();',
                '        if (hwnd == IntPtr.Zero) return false;',
                '        IntPtr shellHwnd = GetShellWindow();',
                '        if (hwnd == shellHwnd) return false;',
                '        System.Text.StringBuilder className = new System.Text.StringBuilder(256);',
                '        if (GetClassName(hwnd, className, className.Capacity) > 0) {',
                '            string cName = className.ToString();',
                '            if (cName == "Progman" || cName == "WorkerW" || cName == "Shell_TrayWnd" || cName == "Shell_SecondaryTrayWnd") {',
                '                return false;',
                '            }',
                '        }',
                '        RECT r;',
                '        if (!GetWindowRect(hwnd, out r)) return false;',
                '        foreach (var screen in System.Windows.Forms.Screen.AllScreens) {',
                '            var bounds = screen.Bounds;',
                '            if (Math.Abs(r.Left - bounds.Left) <= 2 && Math.Abs(r.Top - bounds.Top) <= 2 && Math.Abs(r.Right - bounds.Right) <= 2 && Math.Abs(r.Bottom - bounds.Bottom) <= 2) {',
                '                return true;',
                '            }',
                '        }',
                '        return false;',
                '    }',
                '}',
            ].join('\r\n');

            const base64Code = Buffer.from(csharpCode, 'utf-8').toString('base64');

            const bootstrapScript = [
                'Add-Type -AssemblyName System.Windows.Forms',
                'Add-Type -AssemblyName System.Drawing',
                `$ParentPid = ${process.pid}`,
                '$MyPid = $pid',
                '$null = Start-Job -ScriptBlock {',
                '    $parentPid = $args[0]',
                '    $mainPid = $args[1]',
                '    while ($true) {',
                '        Start-Sleep -Seconds 5',
                '        $parent = Get-Process -Id $parentPid -ErrorAction SilentlyContinue',
                '        if (!$parent) {',
                '            Stop-Process -Id $mainPid -Force -ErrorAction SilentlyContinue',
                '            Exit',
                '        }',
                '    }',
                '} -ArgumentList $ParentPid, $MyPid',
                `$code = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${base64Code}"))`,
                'try { Add-Type -TypeDefinition $code -ReferencedAssemblies "System.Windows.Forms","System.Drawing" -ErrorAction Stop } catch { Write-Error "Add-Type failed: $_" }',
                'Write-Output ("_" + "_BOOTSTRAP_DONE_" + "_")',
                ''
            ].join('\r\n');

            this.currentCallback = {
                nonce: '__BOOTSTRAP_DONE__',
                resolve: () => {
                    this.isReady = true;
                    void logBothToCombined('[PS Daemon] Background PowerShell daemon successfully initialized and bootstrapped.');
                    resolve();
                },
                reject: (err) => {
                    void logBothToCombined(`[PS Daemon] Bootstrap failed: ${err.message}`);
                    reject(err);
                }
            };

            this.process.stdin?.write(bootstrapScript + '\r\n');
        });
    }

    private checkOutput() {
        if (!this.isReady) {
            if (this.outputBuffer.includes('__BOOTSTRAP_DONE__')) {
                this.outputBuffer = '';
                const cb = this.currentCallback;
                this.currentCallback = null;
                cb?.resolve('');
            }
            return;
        }

        if (!this.currentCallback) return;

        const nonce = this.currentCallback.nonce;
        const idx = this.outputBuffer.indexOf(nonce);
        if (idx !== -1) {
            const result = this.outputBuffer.substring(0, idx).trim();
            this.outputBuffer = this.outputBuffer.substring(idx + nonce.length).replace(/^[\r\n]*/, '');
            const cb = this.currentCallback;
            this.currentCallback = null;
            cb?.resolve(result);
            this.processNext();
        }
    }

    private respawn(): void {
        if (!this.supported) return;
        void logBothToCombined('[PS Daemon] Respawning background PowerShell daemon...');
        this.isReady = false;
        if (this.process) {
            const oldProc = this.process;
            this.process = null;
            try {
                oldProc.__isKilledForRespawn = true;
                oldProc.kill();
            } catch (err) {
                console.error('[PS Daemon] Failed to kill process during respawn:', err);
            }
        }
        this.outputBuffer = '';
        this.initPromise = this.init()
            .then(() => {
                this.processNext();
            })
            .catch((err) => {
                void logBothToCombined(`[PS Daemon] Respawn bootstrap failed: ${err.message}`);
            });
    }

    private processNext() {
        if (!this.isReady || this.queue.length === 0 || this.currentCallback !== null) return;
        const task = this.queue.shift();
        if (task) {
            const nonceSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}__`;
            const nonce = `__CMD_DONE_${nonceSuffix}`;
            const timeout = setTimeout(() => {
                if (this.currentCallback && this.currentCallback.nonce === nonce) {
                    const snippet = task.cmd.substring(0, ERROR_SNIPPET_LENGTH);
                    void logBothToCombined(
                        `[PS Daemon] Command timed out after ${this.commandTimeoutMs / 1000}s: "${snippet}". Killing wedged PowerShell process and respawning...`
                    );
                    const cb = this.currentCallback;
                    this.currentCallback = null;
                    cb.reject(new Error(`PowerShell command timed out: ${snippet}`));
                    this.respawn();
                }
            }, this.commandTimeoutMs);

            this.currentCallback = {
                nonce,
                resolve: (val) => {
                    clearTimeout(timeout);
                    task.resolve(val);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    task.reject(err);
                }
            };

            // Split the nonce in the Write-Output expression so PowerShell's stdin echo
            // does not match the completion delimiter before the command actually finishes.
            const wrappedCmd = `& {\r\n${task.cmd}\r\n}\r\nWrite-Output ("__CMD_DONE_" + "${nonceSuffix}")\r\n\r\n`;
            this.process?.stdin?.write(wrappedCmd);
        }
    }

    public async run(cmd: string): Promise<string> {
        if (!this.supported) {
            throw new Error(`Native wallpaper control is not supported on ${process.platform}`);
        }
        if (this.initPromise) {
            await this.initPromise;
        }
        return new Promise((resolve, reject) => {
            this.queue.push({ cmd, resolve, reject });
            this.processNext();
        });
    }

    public kill() {
        void logBothToCombined('[PS Daemon] Killing background PowerShell daemon...');
        this.isReady = false;
        if (this.currentCallback) {
            this.currentCallback.reject(new Error('PowerShell daemon killed'));
            this.currentCallback = null;
        }
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            task?.reject(new Error('PowerShell daemon killed'));
        }
        this.process?.kill();
        this.process = null;
    }
}

export const psDaemon = new PowerShellDaemon();
