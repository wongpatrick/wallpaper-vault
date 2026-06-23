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

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let backendProcess: ChildProcess | null = null;

if (process.platform === 'win32') {
    app.setAppUserModelId('com.wallpaper-vault.app');
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

function startBackend() {
    if (process.env.VITE_DEV_SERVER_URL) {
        console.log('Running in development mode, backend should be started externally.');
        return;
    }

    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logFilePath = path.join(logsDir, 'combined.log');

    logBoth(logFilePath, 'Starting production backend...');

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

    try {
        const binaryPath = path.join(backendPath, 'wallpaper-vault-backend.exe');
        if (fs.existsSync(binaryPath)) {
            logBoth(logFilePath, `Compiled backend found at ${binaryPath}. Spawning backend binary...`);
            backendProcess = spawn(binaryPath, ['--port', '8000'], {
                cwd: backendPath,
                env,
                shell: false
            });
        } else {
            logBoth(logFilePath, `Compiled backend not found at ${binaryPath}. Falling back to uv run uvicorn...`);
            backendProcess = spawn('uv', ['run', 'uvicorn', 'app.main:app', '--port', '8000'], {
                cwd: backendPath,
                env,
                shell: true
            });
        }

        // Pipe backend process output to the combined log file
        const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
        backendProcess.stdout?.pipe(logStream);
        backendProcess.stderr?.pipe(logStream);

        backendProcess.on('close', (code) => {
            logBoth(logFilePath, `Backend process exited with code ${code}`);
        });
    } catch (error) {
        logBoth(logFilePath, `Failed to start backend process: ${error}`);
    }
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
