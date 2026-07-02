/**
 * @file
 * Electron main process script.
 * Manages the application window, tray, inter-process communication, and backend spawn.
 */
import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { spawn, ChildProcess } from 'node:child_process';
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
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        mainWindow?.show();
    }
});
