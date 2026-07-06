/**
 * @file
 * Electron main process script.
 * Manages the application window, tray, inter-process communication, and backend spawn.
 */
import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { spawn, ChildProcess, exec } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_PORT = 8000;
const STARTUP_TIMEOUT_MS = 20000;
const HEARTBEAT_STARTUP_INTERVAL_MS = 5000;
const HEARTBEAT_RUNNING_INTERVAL_MS = 60000;
const PING_TIMEOUT_MS = 2000;
const RESTART_ATTEMPT_DELAY_MS = 2000;
const RESTART_MANUAL_DELAY_MS = 500;
const HTTP_STATUS_OK = 200;
const MAX_AUTO_RESTARTS = 3;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let backendProcess: ChildProcess | null = null;

interface BackendStatusInfo {
    status: 'starting' | 'running' | 'stopped' | 'port-collision' | 'error';
    autoRestartCount: number;
    maxRestarts: number;
    port: number;
    errorDetails?: string;
}

let currentStatus: BackendStatusInfo = {
    status: 'stopped',
    autoRestartCount: 0,
    maxRestarts: MAX_AUTO_RESTARTS,
    port: DEFAULT_PORT
};

let monitorTimeout: NodeJS.Timeout | null = null;
let startupTimeout: NodeJS.Timeout | null = null;
let consecutiveFailures = 0;

if (process.platform === 'win32') {
    app.setAppUserModelId('com.wallpaper-vault.app');
}

const userDataDirArg = process.argv.find(arg => arg.startsWith('--user-data-dir='));
if (userDataDirArg) {
    const customPath = userDataDirArg.split('=')[1];
    app.setPath('userData', customPath);
}

// Disable hardware acceleration to rule out GPU decoding issues
app.disableHardwareAcceleration();

function logBoth(logFilePath: string, msg: string) {
    console.log(msg);
    try {
        fs.appendFileSync(logFilePath, `[Electron] [${new Date().toISOString()}] ${msg}\n`);
    } catch {
        // ignore
    }
}

function getBackendPort(): number {
    if (process.env.VITE_API_BASE_URL) {
        try {
            const url = new URL(process.env.VITE_API_BASE_URL);
            if (url.port) return parseInt(url.port, 10);
        } catch {
            // ignore
        }
    }
    
    try {
        const settingsPath = path.join(app.getPath('userData'), 'window-settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            if (settings.backendPort && !isNaN(Number(settings.backendPort))) {
                return parseInt(settings.backendPort, 10);
            }
        }
    } catch (err) {
        console.error('Failed to read port from settings:', err);
    }
    
    return DEFAULT_PORT;
}

function updateStatus(newStatus: Partial<BackendStatusInfo>) {
    const port = getBackendPort();
    currentStatus = { ...currentStatus, ...newStatus, port };
    console.log(`[Backend Status Change] ${currentStatus.status} on port ${currentStatus.port}`);
    
    if (newStatus.status === 'starting') {
        if (startupTimeout) clearTimeout(startupTimeout);
        startupTimeout = setTimeout(() => {
            if (currentStatus.status === 'starting') {
                logBothToCombined('ERROR: Startup timeout exceeded. Backend failed to respond within 20s.');
                updateStatus({
                    status: 'error',
                    errorDetails: 'Backend took too long to start (timeout exceeded).'
                });
                if (backendProcess) {
                    backendProcess.kill();
                    backendProcess = null;
                }
            }
        }, STARTUP_TIMEOUT_MS);
    } else if (newStatus.status && newStatus.status !== 'starting') {
        if (startupTimeout) {
            clearTimeout(startupTimeout);
            startupTimeout = null;
        }
    }

    if (mainWindow && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('backend-status-change', currentStatus);
        
        if (currentStatus.status === 'error' || currentStatus.status === 'port-collision') {
            mainWindow.show();
            mainWindow.focus();
        }
    }

    if (currentStatus.status === 'running') {
        startRotationCoordinator(currentStatus.port);
    }
}

function logBothToCombined(msg: string) {
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logFilePath = path.join(logsDir, 'combined.log');
    logBoth(logFilePath, msg);
}

function checkPortOccupied(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err: { code?: string }) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true);
            } else {
                resolve(false);
            }
        });
        server.once('listening', () => {
            server.close(() => {
                resolve(false);
            });
        });
        server.listen(port);
    });
}

function pingBackend(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/`, { timeout: PING_TIMEOUT_MS }, (res) => {
            if (res.statusCode === HTTP_STATUS_OK) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
        req.on('error', () => {
            resolve(false);
        });
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

function startMonitorLoop() {
    if (monitorTimeout) clearTimeout(monitorTimeout);
    
    consecutiveFailures = 0;

    const runCheck = async () => {
        const port = getBackendPort();
        const isHealthy = await pingBackend(port);
        
        if (isHealthy) {
            consecutiveFailures = 0;
            if (currentStatus.status === 'starting' || currentStatus.status === 'stopped' || currentStatus.status === 'error') {
                updateStatus({ status: 'running', autoRestartCount: 0, errorDetails: undefined });
            }
        } else {
            if (currentStatus.status === 'running') {
                consecutiveFailures++;
                console.warn(`[Monitor] Heartbeat failed (${consecutiveFailures}/3)`);
                if (consecutiveFailures >= 3) {
                    consecutiveFailures = 0;
                    logBothToCombined('ERROR: Heartbeat failed 3 times consecutively. Restarting backend...');
                    handleBackendCrash('Backend became unresponsive');
                }
            }
        }

        const delay = currentStatus.status === 'starting'
            ? HEARTBEAT_STARTUP_INTERVAL_MS
            : HEARTBEAT_RUNNING_INTERVAL_MS;

        monitorTimeout = setTimeout(runCheck, delay);
    };

    runCheck();
}

function handleBackendCrash(reason: string) {
    if (process.env.VITE_DEV_SERVER_URL) {
        updateStatus({ status: 'stopped', errorDetails: `Backend unreachable: ${reason}` });
        return;
    }

    if (currentStatus.autoRestartCount < currentStatus.maxRestarts) {
        const newCount = currentStatus.autoRestartCount + 1;
        updateStatus({ 
            status: 'starting', 
            autoRestartCount: newCount,
            errorDetails: `Crashed/Unresponsive: ${reason}. Restart attempt ${newCount}/${currentStatus.maxRestarts}...` 
        });
        
        setTimeout(() => {
            spawnBackendProcess();
        }, RESTART_ATTEMPT_DELAY_MS);
    } else {
        updateStatus({ 
            status: 'error', 
            errorDetails: `Backend crashed repeatedly. ${reason}` 
        });
    }
}

function spawnBackendProcess() {
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logFilePath = path.join(logsDir, 'combined.log');
    
    const resourcesPath = process.resourcesPath;
    const backendPath = path.join(resourcesPath, 'backend');
    
    // Relocate database to userData to prevent data loss on updates
    const userDbDir = path.join(userDataPath, 'db');
    fs.mkdirSync(userDbDir, { recursive: true });
    const userDbPath = path.join(userDbDir, 'wallpapers.db');
    
    const templateDbPath = path.join(resourcesPath, 'db', 'wallpapers.db');
    if (!fs.existsSync(userDbPath)) {
        logBoth(logFilePath, `Database not found in userData. Copying template from ${templateDbPath} to ${userDbPath}`);
        try {
            if (fs.existsSync(templateDbPath)) {
                fs.copyFileSync(templateDbPath, userDbPath);
                logBoth(logFilePath, 'Database template copied successfully.');
            } else {
                logBoth(logFilePath, 'WARNING: Template database not found in resources folder.');
            }
        } catch (error) {
            logBoth(logFilePath, `ERROR: Failed to copy template database: ${error}`);
        }
    } else {
        logBoth(logFilePath, `Using existing database in userData: ${userDbPath}`);
    }

    const env = { 
        ...process.env, 
        DATABASE_URL: `sqlite+aiosqlite:///${userDbPath.replace(/\\/g, '/')}`
    };

    const port = getBackendPort();
    const portStr = port.toString();

    try {
        const binaryPath = path.join(backendPath, 'wallpaper-vault-backend.exe');
        if (fs.existsSync(binaryPath)) {
            logBoth(logFilePath, `Compiled backend found at ${binaryPath}. Spawning backend binary on port ${portStr}...`);
            backendProcess = spawn(binaryPath, ['--port', portStr], {
                cwd: backendPath,
                env,
                shell: false
            });
        } else {
            logBoth(logFilePath, `Compiled backend not found at ${binaryPath}. Falling back to uv run uvicorn on port ${portStr}...`);
            backendProcess = spawn('uv', ['run', 'uvicorn', 'app.main:app', '--port', portStr], {
                cwd: backendPath,
                env,
                shell: true
            });
        }

        const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
        backendProcess.stdout?.pipe(logStream);
        backendProcess.stderr?.pipe(logStream);

        backendProcess.on('close', (code) => {
            logBoth(logFilePath, `Backend process exited with code ${code}`);
            backendProcess = null;
            if (!isQuitting) {
                handleBackendCrash(`Backend process exited with code ${code}`);
            }
        });
    } catch (error) {
        logBoth(logFilePath, `Failed to start backend process: ${error}`);
        handleBackendCrash(`Spawn error: ${error}`);
    }
}

function startBackend() {
    if (monitorTimeout) clearTimeout(monitorTimeout);
    if (startupTimeout) clearTimeout(startupTimeout);

    const port = getBackendPort();

    if (process.env.VITE_DEV_SERVER_URL) {
        console.log('Running in development mode, backend should be started externally.');
        updateStatus({ status: 'starting' });
        startMonitorLoop();
        return;
    }

    logBothToCombined('Starting production backend check...');
    
    checkPortOccupied(port).then((isOccupied) => {
        if (isOccupied) {
            logBothToCombined(`ERROR: Port ${port} is already in use by another process.`);
            updateStatus({ status: 'port-collision', errorDetails: `Port ${port} is occupied by another application.` });
            return;
        }

        updateStatus({ status: 'starting' });
        spawnBackendProcess();
        startMonitorLoop();
    });
}

function createTray() {
    console.log('--- Tray Creation (Reverted to Working State) ---');
    try {
        const publicDir = process.env.VITE_DEV_SERVER_URL 
            ? path.resolve(__dirname, '..', 'public')
            : path.join(process.resourcesPath, 'public');
        
        console.log('Public Directory:', publicDir);

        const iconNames = ['vault-icon.png', 'vault-icon.ico', 'vault-tray.png', 'tray.png', 'vault-tray.ico', 'tray.ico'];
        let trayIcon: Electron.NativeImage | null = null;

        for (const name of iconNames) {
            const iconPath = path.join(publicDir, name);
            if (!fs.existsSync(iconPath)) continue;

            try {
                const buffer = fs.readFileSync(iconPath);
                console.log(`Checking ${name} (${buffer.length} bytes)`);

                // Strategy A: Direct Buffer
                let img = nativeImage.createFromBuffer(buffer);
                
                // Strategy B: Buffer with scale factor
                if (img.isEmpty()) {
                    img = nativeImage.createFromBuffer(buffer, { width: 16, height: 16 });
                }

                // Strategy C: Path
                if (img.isEmpty()) {
                    img = nativeImage.createFromPath(iconPath);
                }

                // Strategy D: Data URL
                if (img.isEmpty()) {
                    const ext = path.extname(name).toLowerCase();
                    const mimeType = ext === '.svg' ? 'image/svg+xml' : 'image/png';
                    img = nativeImage.createFromDataURL(`data:${mimeType};base64,${buffer.toString('base64')}`);
                }

                if (!img.isEmpty()) {
                    trayIcon = img;
                    console.log(`  SUCCESS: Loaded ${name}`);
                    break;
                }
                console.warn(`  FAILED: All strategies failed for ${name}`);
            } catch (err) {
                console.error(`  ERROR processing ${name}:`, err);
            }
        }

        if (!trayIcon || trayIcon.isEmpty()) {
            console.error('CRITICAL: No valid icon could be decoded. Using empty fallback.');
            trayIcon = nativeImage.createEmpty();
        }

        if (tray) tray.destroy();
        tray = new Tray(trayIcon);
        
        const contextMenu = Menu.buildFromTemplate([
            { 
                label: 'Show App', 
                click: () => {
                    mainWindow?.show();
                    mainWindow?.focus();
                } 
            },
            { type: 'separator' },
            { 
                label: 'Quit', 
                click: () => {
                    isQuitting = true;
                    app.quit();
                } 
            }
        ]);
        
        tray.setToolTip('Wallpaper Vault');
        tray.setContextMenu(contextMenu);
        
        tray.on('click', () => {
            if (mainWindow?.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow?.show();
                mainWindow?.focus();
            }
        });
        
        console.log('Tray creation process complete.');
    } catch (error) {
        console.error('FATAL: Tray creation crashed:', error);
    }
}

function createWindow() {
    // Disable standard application menu
    Menu.setApplicationMenu(null);

    const publicDir = process.env.VITE_DEV_SERVER_URL 
        ? path.resolve(__dirname, '..', 'public')
        : path.join(process.resourcesPath, 'public');

    mainWindow = new BrowserWindow({
        width: 1600,
        height: 800,
        titleBarStyle: 'hidden',
        icon: path.join(publicDir, 'vault-icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false
        },
    })

    // Open HTTP/HTTPS links in the user's default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https:')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('window-maximized-change', true);
    });

    mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('window-maximized-change', false);
    });

    const settingsPath = path.join(app.getPath('userData'), 'window-settings.json');

    mainWindow.on('close', async (event) => {
        if (process.env.NODE_ENV === 'test') {
            isQuitting = true;
            if (backendProcess) {
                backendProcess.kill();
            }
            app.exit(0);
            return false;
        }
        if (!isQuitting) {
            event.preventDefault();

            let hideNotification = false;
            let closeBehavior = 'minimize';
            try {
                if (fs.existsSync(settingsPath)) {
                    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                    hideNotification = settings.hideMinimizeNotification || false;
                    closeBehavior = settings.closeBehavior || 'minimize';
                }
            } catch (err) {
                console.error('Failed to read window settings:', err);
            }

            if (closeBehavior === 'exit') {
                isQuitting = true;
                if (backendProcess) {
                    backendProcess.kill();
                }
                app.quit();
                return false;
            }

            if (!hideNotification && mainWindow) {
                const { checkboxChecked } = await dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    buttons: ['OK'],
                    title: 'Minimized to Tray',
                    message: 'The application will continue to run in the background. To fully exit, right-click the tray icon and select "Quit".',
                    checkboxLabel: "Don't show this again",
                    defaultId: 0
                });

                if (checkboxChecked) {
                    try {
                        let currentSettings: Record<string, unknown> = {};
                        if (fs.existsSync(settingsPath)) {
                            currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                        }
                        currentSettings.hideMinimizeNotification = true;
                        fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2));
                    } catch (err) {
                        console.error('Failed to save window settings:', err);
                    }
                }
            }

            mainWindow?.hide();
        }
        return false;
    });
    
    ipcMain.handle('open-directory', async () => {
        if (!mainWindow) return null;
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        })
        if (canceled) {
            return null
        } else {
            return filePaths[0]
        }
    })

    ipcMain.handle('open-path', async (_event, filePath: string) => {
        if (!filePath) return { success: false, error: 'No path provided' };
        
        const normalizedPath = path.normalize(filePath);
        const error = await shell.openPath(normalizedPath);
        if (error) {
            console.error('Failed to open path:', error);
            return { success: false, error };
        }
        return { success: true };
    })

    ipcMain.handle('get-login-item-settings', () => {
        return app.getLoginItemSettings().openAtLogin;
    });

    ipcMain.handle('set-login-item-settings', (_event, openAtLogin: boolean) => {
        app.setLoginItemSettings({
            openAtLogin: openAtLogin,
            openAsHidden: true,
        });
        return app.getLoginItemSettings().openAtLogin;
    });

    ipcMain.handle('window-minimize', () => {
        mainWindow?.minimize();
    });

    ipcMain.handle('window-maximize', () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
        }
    });

    ipcMain.handle('window-close', () => {
        mainWindow?.close();
    });

    ipcMain.handle('is-maximized', () => {
        return mainWindow?.isMaximized() || false;
    });

    ipcMain.handle('get-close-behavior', () => {
        try {
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                return settings.closeBehavior || 'minimize';
            }
        } catch (err) {
            console.error('Failed to read close behavior:', err);
        }
        return 'minimize';
    });

    ipcMain.handle('set-close-behavior', (_event, behavior: 'minimize' | 'exit') => {
        try {
            let settings: Record<string, unknown> = {};
            if (fs.existsSync(settingsPath)) {
                settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            }
            settings.closeBehavior = behavior;
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            return true;
        } catch (err) {
            console.error('Failed to save close behavior:', err);
            return false;
        }
    });

    ipcMain.handle('get-backend-status', () => {
        return currentStatus;
    });

    ipcMain.handle('restart-backend', async () => {
        logBothToCombined('User requested manual backend restart.');
        updateStatus({ status: 'starting', autoRestartCount: 0, errorDetails: undefined });
        if (backendProcess) {
            backendProcess.kill();
            backendProcess = null;
        }
        setTimeout(() => {
            startBackend();
        }, RESTART_MANUAL_DELAY_MS);
        return true;
    });

    ipcMain.handle('set-backend-port', (_event, port: number) => {
        try {
            let settings: Record<string, unknown> = {};
            if (fs.existsSync(settingsPath)) {
                settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            }
            settings.backendPort = port;
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            logBothToCombined(`Backend port updated in settings to ${port}`);
            return true;
        } catch (err) {
            console.error('Failed to save backend port:', err);
            return false;
        }
    });

    ipcMain.handle('open-backend-logs', async () => {
        const userDataPath = app.getPath('userData');
        const logFilePath = path.join(userDataPath, 'logs', 'combined.log');
        if (fs.existsSync(logFilePath)) {
            await shell.openPath(logFilePath);
            return true;
        }
        return false;
    });

    ipcMain.handle('open-logs-directory', async () => {
        const userDataPath = app.getPath('userData');
        const logsDir = path.join(userDataPath, 'logs');
        if (fs.existsSync(logsDir)) {
            await shell.openPath(logsDir);
            return true;
        }
        return false;
    });

    ipcMain.handle('get-monitors', async () => {
        return await getOrderedDisplays();
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
        
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.type === 'keyDown') {
                const isDevToolsShortcut =
                    input.key === 'F12' ||
                    (input.control && input.shift && input.key.toLowerCase() === 'i') ||
                    (input.meta && input.alt && input.key.toLowerCase() === 'i');
                
                if (isDevToolsShortcut) {
                    mainWindow?.webContents.toggleDevTools();
                    event.preventDefault();
                }
            }
        });
    } else {
        mainWindow.loadFile(path.join(__dirname, `../dist/index.html`))
    }
}

app.on('before-quit', () => {
    isQuitting = true;
    if (monitorTimeout) clearTimeout(monitorTimeout);
    if (startupTimeout) clearTimeout(startupTimeout);
    if (backendProcess) {
        backendProcess.kill();
    }
});

app.whenReady().then(() => {
    startBackend();
    createWindow();
    // Delay tray creation by 1s to allow OS/GPU systems to stabilize
    const TRAY_CREATION_DELAY_MS = 1000;
    setTimeout(createTray, TRAY_CREATION_DELAY_MS);

    // Monitor configuration/metrics change listeners to refresh coordinates cache
    screen.on('display-added', () => {
        console.log('[Rotation Coordinator] Monitor added, invalidating layout cache...');
        cachedOrderedDisplays = null;
    });
    screen.on('display-removed', () => {
        console.log('[Rotation Coordinator] Monitor removed, invalidating layout cache...');
        cachedOrderedDisplays = null;
    });
    screen.on('display-metrics-changed', () => {
        console.log('[Rotation Coordinator] Monitor metrics changed, invalidating layout cache...');
        cachedOrderedDisplays = null;
    });
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        mainWindow?.show();
    }
});

/* eslint-disable no-magic-numbers, no-useless-escape, @typescript-eslint/no-explicit-any */
// ==========================================
// Desktop Rotation Coordination & Changer
// ==========================================

let activeSsePort: number | null = null;
let activeSseRequest: http.ClientRequest | null = null;
const nativeRotationTimers: Map<number, NodeJS.Timeout> = new Map();

interface MonitorRotationConfig {
    mode: 'displayfusion' | 'native';
    interval: number;
    source: 'entire_library' | 'playlist';
    playlistId: string;
    favoriteProbability: number;
    enabled: boolean;
}

let globalRotationConfig = {
    mode: 'displayfusion',
    interval: 15,
    source: 'entire_library',
    playlistId: '',
    favoriteProbability: 0.4
};

const monitorConfigs: Map<number, MonitorRotationConfig> = new Map();

let cachedOrderedDisplays: any[] | null = null;

function runPsScript(scriptLines: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const tempPath = path.join(app.getPath('temp'), `wv-${Date.now()}.ps1`);
        fs.writeFileSync(tempPath, scriptLines.join('\r\n'), 'utf8');
        exec(`Powershell.exe -ExecutionPolicy Bypass -File "${tempPath}"`, (err, stdout) => {
            fs.unlink(tempPath, () => {});
            if (err) reject(err);
            else resolve(stdout.trim());
        });
    });
}

// Script 1: Get actual Windows display numbers via EnumDisplayDevices
const winDisplayScript = [
    '$code = @\'',
    'using System;',
    'using System.Collections.Generic;',
    'using System.Runtime.InteropServices;',
    'using System.Text.RegularExpressions;',
    '',
    '[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
    'public struct DISPLAY_DEVICE {',
    '    public int cb;',
    '    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]',
    '    public string DeviceName;',
    '    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]',
    '    public string DeviceString;',
    '    public int StateFlags;',
    '    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]',
    '    public string DeviceID;',
    '    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]',
    '    public string DeviceKey;',
    '}',
    '',
    '[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
    'public struct DEVMODE {',
    '    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]',
    '    public string dmDeviceName;',
    '    public short dmSpecVersion;',
    '    public short dmDriverVersion;',
    '    public short dmSize;',
    '    public short dmDriverExtra;',
    '    public int dmFields;',
    '    public int dmPositionX;',
    '    public int dmPositionY;',
    '    public int dmDisplayOrientation;',
    '    public int dmDisplayFixedOutput;',
    '    public short dmColor;',
    '    public short dmDuplex;',
    '    public short dmYResolution;',
    '    public short dmTTOption;',
    '    public short dmCollate;',
    '    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]',
    '    public string dmFormName;',
    '    public short dmLogPixels;',
    '    public int dmBitsPerPel;',
    '    public int dmPelsWidth;',
    '    public int dmPelsHeight;',
    '    public int dmDisplayFlags;',
    '    public int dmDisplayFrequency;',
    '    public int dmICMMethod;',
    '    public int dmICMIntent;',
    '    public int dmMediaType;',
    '    public int dmDitherType;',
    '    public int dmReserved1;',
    '    public int dmReserved2;',
    '    public int dmPanningWidth;',
    '    public int dmPanningHeight;',
    '}',
    '',
    'public class WinDisplayHelper {',
    '    [DllImport("user32.dll", CharSet = CharSet.Unicode)]',
    '    static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);',
    '    [DllImport("user32.dll", CharSet = CharSet.Unicode)]',
    '    static extern bool EnumDisplaySettingsEx(string lpszDeviceName, int iModeNum, ref DEVMODE lpDevMode, uint dwFlags);',
    '    const int ENUM_CURRENT_SETTINGS = -1;',
    '    const int DISPLAY_DEVICE_ACTIVE = 0x1;',
    '    public static string GetLayout() {',
    '        var results = new List<string>();',
    '        uint devIdx = 0;',
    '        DISPLAY_DEVICE dd = new DISPLAY_DEVICE();',
    '        dd.cb = Marshal.SizeOf(dd);',
    '        while (EnumDisplayDevices(null, devIdx, ref dd, 0)) {',
    '            if ((dd.StateFlags & DISPLAY_DEVICE_ACTIVE) != 0) {',
    '                DEVMODE dm = new DEVMODE();',
    '                dm.dmSize = (short)Marshal.SizeOf(dm);',
    '                EnumDisplaySettingsEx(dd.DeviceName, ENUM_CURRENT_SETTINGS, ref dm, 0);',
    '                string numStr = Regex.Replace(dd.DeviceName, @"[^0-9]", "");',
    '                int winNum = 0;',
    '                int.TryParse(numStr, out winNum);',
    '                results.Add("{" +',
    '                    "\\"winNum\\":" + winNum +',
    '                    ",\\"x\\":" + dm.dmPositionX +',
    '                    ",\\"y\\":" + dm.dmPositionY +',
    '                    ",\\"w\\":" + dm.dmPelsWidth +',
    '                    ",\\"h\\":" + dm.dmPelsHeight + "}");',
    '            }',
    '            devIdx++;',
    '            dd.cb = Marshal.SizeOf(dd);',
    '        }',
    '        return "[" + string.Join(",", results) + "]";',
    '    }',
    '}',
    '\'@',
    'try { Add-Type -TypeDefinition $code -ErrorAction Stop } catch {}',
    '[WinDisplayHelper]::GetLayout()',
];

// Script 2: Get COM monitor indices and their physical coordinates
const comDisplayScript = [
    '$code = @\'',
    'using System;',
    'using System.Collections.Generic;',
    'using System.Runtime.InteropServices;',
    '[StructLayout(LayoutKind.Sequential)]',
    'public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
    '[ComImport, Guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD")]',
    'public class DesktopWallpaperClass {}',
    '[ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
    '[CoClass(typeof(DesktopWallpaperClass))]',
    'public interface IDesktopWallpaper {',
    '    void SetWallpaper(string monitorID, string wallpaper);',
    '    void GetWallpaper(string monitorID, out string wallpaper);',
    '    void GetMonitorDevicePathAt(uint monitorIndex, out string monitorID);',
    '    void GetMonitorDevicePathCount(out uint count);',
    '    void GetMonitorRECT(string monitorID, out RECT displayRect);',
    '}',
    'public class ComDisplayHelper {',
    '    public static string GetLayout() {',
    '        IDesktopWallpaper w = (IDesktopWallpaper)new DesktopWallpaperClass();',
    '        uint count = 0;',
    '        w.GetMonitorDevicePathCount(out count);',
    '        var results = new List<string>();',
    '        for (uint i = 0; i < count; i++) {',
    '            try {',
    '                string id;',
    '                w.GetMonitorDevicePathAt(i, out id);',
    '                RECT r;',
    '                w.GetMonitorRECT(id, out r);',
    '                results.Add("{" +',
    '                    "\\"comIndex\\":" + i +',
    '                    ",\\"x\\":" + r.Left +',
    '                    ",\\"y\\":" + r.Top +',
    '                    ",\\"w\\":" + (r.Right - r.Left) +',
    '                    ",\\"h\\":" + (r.Bottom - r.Top) + "}");',
    '            } catch {}',
    '        }',
    '        return "[" + string.Join(",", results) + "]";',
    '    }',
    '}',
    '\'@',
    'try { Add-Type -TypeDefinition $code -ErrorAction Stop } catch {}',
    '[ComDisplayHelper]::GetLayout()',
];

async function getOrderedDisplays(): Promise<any[]> {
    if (cachedOrderedDisplays) return cachedOrderedDisplays;

    const displays = screen.getAllDisplays();

    const makeFallback = () => displays.map((d, i) => ({
        index: i, winNum: i + 1, id: d.id,
        label: `Monitor ${i + 1} (${d.bounds.width}x${d.bounds.height})`,
        bounds: d.bounds
    }));

    try {
        // Run both scripts in parallel
        const [winRaw, comRaw] = await Promise.all([
            runPsScript(winDisplayScript),
            runPsScript(comDisplayScript)
        ]);

        const winDisplays: Array<{ winNum: number; x: number; y: number; w: number; h: number }> = JSON.parse(winRaw);
        const comDisplays: Array<{ comIndex: number; x: number; y: number; w: number; h: number }> = JSON.parse(comRaw);

        logBothToCombined('[Rotation Coordinator] Electron displays: ' + JSON.stringify(displays.map(d => ({ id: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor }))));
        logBothToCombined('[Rotation Coordinator] Windows displays: ' + JSON.stringify(winDisplays));
        logBothToCombined('[Rotation Coordinator] COM displays: ' + JSON.stringify(comDisplays));

        // Match each Windows display to a COM display by physical coordinates (both use physical pixels)
        const winToComMap: Array<{ winNum: number; comIndex: number; x: number; y: number; w: number; h: number }> = [];
        for (const winDisp of winDisplays) {
            let bestCom: any = null;
            let minDist = Infinity;
            for (const comDisp of comDisplays) {
                const dist = Math.abs(winDisp.x - comDisp.x) + Math.abs(winDisp.y - comDisp.y);
                if (dist < minDist) { minDist = dist; bestCom = comDisp; }
            }
            if (bestCom && minDist < 100) {
                winToComMap.push({
                    winNum: winDisp.winNum, comIndex: bestCom.comIndex,
                    x: winDisp.x, y: winDisp.y, w: winDisp.w, h: winDisp.h
                });
            }
        }

        logBothToCombined('[Rotation Coordinator] Win-to-COM mapping: ' + JSON.stringify(winToComMap));

        // Match each mapped entry to an Electron display
        const ordered: any[] = [];
        for (const mapping of winToComMap) {
            let bestElectron: any = null;
            let minDist = Infinity;
            for (const d of displays) {
                const physX = d.bounds.x * d.scaleFactor;
                const physY = d.bounds.y * d.scaleFactor;
                const dist = Math.abs(physX - mapping.x) + Math.abs(physY - mapping.y);
                if (dist < minDist) { minDist = dist; bestElectron = d; }
            }
            if (bestElectron && minDist < 1500) {
                ordered.push({
                    index: mapping.comIndex,
                    winNum: mapping.winNum,
                    id: bestElectron.id,
                    label: `Monitor ${mapping.winNum} (${bestElectron.bounds.width}x${bestElectron.bounds.height})`,
                    bounds: bestElectron.bounds
                });
            }
        }

        // Add any unmatched Electron displays as fallback
        displays.forEach(d => {
            if (!ordered.some(od => od.id === d.id)) {
                ordered.push({
                    index: ordered.length, winNum: ordered.length + 1, id: d.id,
                    label: `Monitor ${ordered.length + 1} (${d.bounds.width}x${d.bounds.height})`,
                    bounds: d.bounds
                });
            }
        });

        ordered.sort((a, b) => a.winNum - b.winNum);

        console.log('[Rotation Coordinator] Successfully aligned display indices with Windows OS settings:', ordered);
        cachedOrderedDisplays = ordered;
        return ordered;
    } catch (err) {
        console.error('[Rotation Coordinator] Failed to get Windows monitor layout, falling back to Electron defaults:', err);
        const fallback = makeFallback();
        cachedOrderedDisplays = fallback;
        return fallback;
    }
}

async function fetchRotationSettings(port: number): Promise<boolean> {
    const displays = await getOrderedDisplays();
    return new Promise((resolve) => {
        const url = `http://127.0.0.1:${port}/api/settings`;
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const settingsArray = JSON.parse(data);
                    if (Array.isArray(settingsArray)) {
                        const getVal = (key: string, def: any): any => {
                            const found = settingsArray.find((s: any) => s.key === key);
                            return found !== undefined && found.value !== null ? found.value : def;
                        };
                        
                        // 1. Load Global Config
                        globalRotationConfig = {
                            mode: String(getVal('wallpaper_rotation_mode', 'displayfusion')) as any,
                            interval: parseInt(String(getVal('wallpaper_rotation_interval', '15')), 10) || 15,
                            source: String(getVal('wallpaper_rotation_source', 'entire_library')) as any,
                            playlistId: String(getVal('wallpaper_rotation_playlist_id', '')),
                            favoriteProbability: parseFloat(String(getVal('favorite_rotation_probability', '0.4'))) || 0.4
                        };


                        // 2. Load Monitor Overrides
                        monitorConfigs.clear();
                        
                        displays.forEach((display) => {
                            const index = display.index;
                            const overrideVal = getVal(`monitor_${index}_override_enabled`, false);
                            const overrideEnabled = overrideVal === true || String(overrideVal) === 'true';
                            
                            monitorConfigs.set(index, {
                                enabled: overrideEnabled,
                                mode: (overrideEnabled ? String(getVal(`monitor_${index}_wallpaper_rotation_mode`, globalRotationConfig.mode)) : globalRotationConfig.mode) as any,
                                interval: overrideEnabled ? (parseInt(String(getVal(`monitor_${index}_wallpaper_rotation_interval`, String(globalRotationConfig.interval))), 10) || 15) : globalRotationConfig.interval,
                                source: (overrideEnabled ? String(getVal(`monitor_${index}_wallpaper_rotation_source`, globalRotationConfig.source)) : globalRotationConfig.source) as any,
                                playlistId: overrideEnabled ? String(getVal(`monitor_${index}_wallpaper_rotation_playlist_id`, globalRotationConfig.playlistId)) : globalRotationConfig.playlistId,
                                favoriteProbability: overrideEnabled ? (parseFloat(String(getVal(`monitor_${index}_favorite_rotation_probability`, String(globalRotationConfig.favoriteProbability)))) || 0.4) : globalRotationConfig.favoriteProbability
                            });
                        });
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                } catch {
                    resolve(false);
                }
            });
        }).on('error', () => {
            resolve(false);
        });
    });
}

function startRotationCoordinator(port: number) {
    if (activeSsePort === port) {
        return; // Already connected to this port
    }
    activeSsePort = port;

    if (activeSseRequest) {
        activeSseRequest.destroy();
        activeSseRequest = null;
    }

    fetchRotationSettings(port).then((ok) => {
        if (ok) {
            setupNativeTimers(port);
        }

        const url = `http://127.0.0.1:${port}/api/rotation-history/events`;
        console.log(`[Rotation Coordinator] Connecting to SSE at ${url}`);

        activeSseRequest = http.get(url, (res) => {
            let buffer = '';
            res.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.event === 'skip') {
                                handleSkipEvent(port, data.target_monitor || 'all');
                            } else if (data.event === 'rotation') {
                                handleRotationEvent(port, data.image, data.target_monitor || 'all');
                            } else if (data.event === 'ping') {
                                fetchRotationSettings(port).then((okVal) => {
                                    if (okVal) setupNativeTimers(port);
                                });
                            }
                        } catch {
                            // ignore parsing errors
                        }
                    }
                }
            });

            res.on('end', () => {
                console.log('[Rotation Coordinator] SSE stream closed. Reconnecting...');
                activeSsePort = null;
                setTimeout(() => startRotationCoordinator(port), 5000);
            });
        });

        activeSseRequest.on('error', (err) => {
            console.error('[Rotation Coordinator] SSE error:', err);
            activeSsePort = null;
            setTimeout(() => startRotationCoordinator(port), 5000);
        });
    });
}

async function setupNativeTimers(port: number) {
    // Clear all existing active timers
    nativeRotationTimers.forEach((timer) => clearInterval(timer));
    nativeRotationTimers.clear();

    const displays = await getOrderedDisplays();
    let hasOverrides = false;

    displays.forEach((display) => {
        const index = display.index;
        const config = monitorConfigs.get(index);
        if (config && config.enabled) {
            hasOverrides = true;
            if (config.mode === 'native') {
                const intervalMs = config.interval * 60 * 1000;
                console.log(`[Rotation Coordinator] Spawning timer for Monitor ${index + 1} (${config.interval} mins)`);
                const timer = setInterval(() => {
                    triggerNativeRotation(port, index);
                }, intervalMs);
                nativeRotationTimers.set(index, timer);
            }
        }
    });

    if (!hasOverrides && globalRotationConfig.mode === 'native') {
        const intervalMs = globalRotationConfig.interval * 60 * 1000;
        console.log(`[Rotation Coordinator] No overrides. Spawning global native timer (${globalRotationConfig.interval} mins)`);
        const timer = setInterval(() => {
            triggerNativeRotation(port, -1);
        }, intervalMs);
        nativeRotationTimers.set(-1, timer);
    }
}

async function triggerNativeRotation(port: number, monitorIndex: number) {
    if (monitorIndex === -1) {
        // Trigger separately for each monitor to ensure specific aspect ratio matching
        const displays = await getOrderedDisplays();
        displays.forEach((display) => {
            triggerNativeRotation(port, display.index);
        });
        return;
    }

    console.log(`[Rotation Coordinator] Triggering native rotation for Monitor ${monitorIndex + 1}...`);
    
    const config = monitorConfigs.get(monitorIndex) || globalRotationConfig;
    
    let randomUrl = `/api/images/random`;
    if (config.source === 'playlist' && config.playlistId) {
        randomUrl = `/api/playlists/${config.playlistId}/random`;
    }

    const params = new URLSearchParams();
    if (config.favoriteProbability !== undefined) {
        params.append('favorite_probability', String(config.favoriteProbability));
    }
    params.append('target_monitor', String(monitorIndex));

    // Dynamic Orientation Auto-Detect based on monitor dimensions
    const displays = await getOrderedDisplays();
    const display = displays.find(d => d.index === monitorIndex);
    if (display) {
        const { width, height } = display.bounds;
        const orientation = width > height ? 'landscape' : 'portrait';
        params.append('orientation', orientation);
        console.log(`[Rotation Coordinator] Auto-detected orientation for Monitor ${monitorIndex + 1}: ${orientation} (${width}x${height})`);
    }

    const url = `http://127.0.0.1:${port}${randomUrl}?${params.toString()}`;
    http.get(url, () => {
        // Backend handles DB logging and broadcasting
    }).on('error', (err) => {
        console.error('[Rotation Coordinator] Failed to trigger rotation:', err);
    });
}

function handleSkipEvent(port: number, targetMonitor: string) {
    console.log(`[Rotation Coordinator] Skip event triggered for monitor target: ${targetMonitor}`);
    
    // Refresh settings and rebuild timers immediately on skip (e.g. after configuration saves)
    fetchRotationSettings(port).then((ok) => {
        if (ok) {
            setupNativeTimers(port);
        }
        
        if (targetMonitor === 'all') {
            if (globalRotationConfig.mode === 'displayfusion') {
                executeDisplayFusionSkip();
            } else {
                triggerNativeRotation(port, -1);
            }
        } else {
            const index = parseInt(targetMonitor, 10);
            const config = monitorConfigs.get(index) || globalRotationConfig;
            
            if (config.mode === 'displayfusion') {
                executeDisplayFusionSkip();
            } else {
                triggerNativeRotation(port, index);
            }
        }
    });
}

function executeDisplayFusionSkip() {
    const paths = [
        'C:\\Program Files\\DisplayFusion\\DisplayFusionCommand.exe',
        'C:\\Program Files (x86)\\DisplayFusion\\DisplayFusionCommand.exe'
    ];
    let exePath = '';
    for (const p of paths) {
        if (fs.existsSync(p)) {
            exePath = p;
            break;
        }
    }
    if (!exePath) {
        console.warn('[Rotation Coordinator] DisplayFusion CLI executable not found.');
        return;
    }

    console.log(`[Rotation Coordinator] Calling DisplayFusion skip: "${exePath}" -WallpaperNextImage`);
    exec(`"${exePath}" -WallpaperNextImage`, (err) => {
        if (err) {
            console.error('[Rotation Coordinator] DisplayFusion CLI failed:', err);
        }
    });
}

function handleRotationEvent(port: number, image: any, targetMonitor: string) {
    console.log(`[Rotation Coordinator] Rotation event for image ID ${image.id} on target monitor: ${targetMonitor}`);
    
    if (targetMonitor === 'all') {
        if (globalRotationConfig.mode === 'native') {
            applyNativeWallpaper(port, image, -1);
        }
    } else {
        const index = parseInt(targetMonitor, 10);
        const config = monitorConfigs.get(index) || globalRotationConfig;
        
        if (config.mode === 'native') {
            applyNativeWallpaper(port, image, index);
        }
    }
}

function applyNativeWallpaper(port: number, image: any, monitorIndex: number) {
    const tempDir = app.getPath('temp');
    const filename = `wallpaper-vault-active-monitor-${monitorIndex === -1 ? 'all' : monitorIndex}.jpg`;
    const tempPath = path.join(tempDir, filename);

    const fileUrl = `http://127.0.0.1:${port}/api/images/file/${image.id}`;
    console.log(`[Rotation Coordinator] Downloading active image for Monitor ${monitorIndex === -1 ? 'Global' : monitorIndex + 1} to ${tempPath}`);

    const fileStream = fs.createWriteStream(tempPath);
    http.get(fileUrl, (res) => {
        res.pipe(fileStream);
        fileStream.on('finish', () => {
            fileStream.close();
            setWallpaperNatively(tempPath, monitorIndex);
        });
    }).on('error', (err) => {
        console.error('[Rotation Coordinator] File download error:', err);
        fileStream.close();
    });
}

function setWallpaperNatively(imagePath: string, monitorIndex: number) {
    const absolutePath = path.resolve(imagePath);
    let powershellCmd = '';

    if (monitorIndex === -1) {
        powershellCmd = `Powershell.exe -Command "Add-Type -TypeDefinition \\"using System; using System.Runtime.InteropServices; public class Wallpaper { [DllImport(\\\\"user32.dll\\\\", CharSet = CharSet.Auto)] public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni); }\\"; [Wallpaper]::SystemParametersInfo(20, 0, \\"${absolutePath}\\", 3)"`;
    } else {
        powershellCmd = `Powershell.exe -Command "
$code = @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid(\\\"C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD\\\")]
public class DesktopWallpaperClass {}

[ComImport, Guid(\\\"B92B56A9-8B55-4E14-9A89-0199BBB6F93B\\\"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[CoClass(typeof(DesktopWallpaperClass))]
public interface IDesktopWallpaper {
    void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
    void GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] out string wallpaper);
    void GetMonitorDevicePathAt(uint monitorIndex, [MarshalAs(UnmanagedType.LPWStr)] out string monitorID);
    void GetMonitorDevicePathCount(out uint count);
}

public class WallpaperHelper {
    public static void SetMonitorWallpaper(uint monitorIndex, string path) {
        IDesktopWallpaper wallpaper = (IDesktopWallpaper)new DesktopWallpaperClass();
        uint count = 0;
        wallpaper.GetMonitorDevicePathCount(out count);
        if (monitorIndex < count) {
            string monitorID;
            wallpaper.GetMonitorDevicePathAt(monitorIndex, out monitorID);
            wallpaper.SetWallpaper(monitorID, path);
        }
    }
}
'@
Add-Type -TypeDefinition $code
[WallpaperHelper]::SetMonitorWallpaper(${monitorIndex}, \\"${absolutePath}\\")
"`;
    }

    console.log(`[Rotation Coordinator] Executing PowerShell background updater for Monitor ${monitorIndex === -1 ? 'Global' : monitorIndex + 1}...`);
    exec(powershellCmd, (err) => {
        if (err) {
            console.error('[Rotation Coordinator] PowerShell wallpaper update failed:', err);
        } else {
            console.log('[Rotation Coordinator] Natively set wallpaper succeeded.');
        }
    });
}
