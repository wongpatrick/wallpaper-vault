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

function startBackend() {
    if (process.env.VITE_DEV_SERVER_URL) {
        console.log('Running in development mode, backend should be started externally.');
        return;
    }

    console.log('Starting production backend...');
    
    const resourcesPath = process.resourcesPath;
    const backendPath = path.join(resourcesPath, 'backend');
    const dbPath = path.join(resourcesPath, 'db', 'wallpapers.db');
    
    const env = { 
        ...process.env, 
        DATABASE_URL: `sqlite+aiosqlite:///${dbPath.replace(/\\/g, '/')}`
    };

    try {
        backendProcess = spawn('uv', ['run', 'uvicorn', 'app.main:app', '--port', '8000'], {
            cwd: backendPath,
            env,
            shell: true
        });

        backendProcess.stdout?.on('data', (data) => {
            console.log(`Backend: ${data}`);
        });

        backendProcess.stderr?.on('data', (data) => {
            console.error(`Backend Error: ${data}`);
        });

        backendProcess.on('close', (code) => {
            console.log(`Backend process exited with code ${code}`);
        });
    } catch (error) {
        console.error('Failed to start backend process:', error);
    }
}

function createTray() {
    console.log('--- Tray Creation (Reverted to Working State) ---');
    try {
        const publicDir = process.env.VITE_DEV_SERVER_URL 
            ? path.resolve(__dirname, '..', 'public')
            : path.join(process.resourcesPath, 'public');
        
        console.log('Public Directory:', publicDir);

        const iconNames = ['tray.svg', 'favicon.svg'];
        let trayIcon: any = null;

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
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false
        },
    })

    const settingsPath = path.join(app.getPath('userData'), 'window-settings.json');

    mainWindow.on('close', async (event) => {
        if (!isQuitting) {
            event.preventDefault();

            let hideNotification = false;
            try {
                if (fs.existsSync(settingsPath)) {
                    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                    hideNotification = settings.hideMinimizeNotification;
                }
            } catch (err) {
                console.error('Failed to read window settings:', err);
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
                        fs.writeFileSync(settingsPath, JSON.stringify({ hideMinimizeNotification: true }));
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

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
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
    setTimeout(createTray, 1000);
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        mainWindow?.show();
    }
});
