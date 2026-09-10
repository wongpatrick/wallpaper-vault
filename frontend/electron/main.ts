/**
 * @file
 * Electron main process script.
 * Orchestrates window management, inter-process communication, and system services.
 */
import { app, BrowserWindow, ipcMain, dialog, shell, Menu, screen, powerMonitor } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { VaultRegistryManager } from './vaultRegistry';
import {
    type AppContext,
    HTTP_STATUS_OK,
    HTTPS_DEFAULT_PORT,
    HTTP_DEFAULT_PORT,
    loadInitialSettings,
    getBackendPort,
    readWindowSettings,
    writeWindowSettings,
    logBothToCombined
} from './services/appContext';
import { BackendProcessManager } from './services/backendProcess';
import { psDaemon } from './services/powerShellDaemon';
import {
    getOrderedDisplays,
    getSystemWallpapers,
    setWallpaperNatively,
    setPowerStateSuspended,
    setPendingDisplayChange,
    getPendingDisplayChange,
    invalidateDisplayCache
} from './services/monitorLayout';
import { RotationCoordinator } from './services/rotationCoordinator';
import { TrayManager } from './services/trayManager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let vaultRegistryManager: VaultRegistryManager | null = null;

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

const appContext: AppContext = {
    getMainWindow: () => mainWindow,
    getBackendPort,
    isQuitting: () => isQuitting,
    setQuitting: (v: boolean) => { isQuitting = v; },
    logToCombined: logBothToCombined
};

const rotationCoordinator = new RotationCoordinator(appContext);
const trayManager = new TrayManager(appContext, rotationCoordinator);
const backendManager = new BackendProcessManager(appContext, (port) => {
    rotationCoordinator.start(port);
});

function createWindow() {
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
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https:')) {
            void shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('window-maximized-change', true);
    });

    mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('window-maximized-change', false);
    });

    mainWindow.on('close', async (event) => {
        if (process.env.NODE_ENV === 'test') {
            isQuitting = true;
            backendManager.kill();
            app.exit(0);
            return false;
        }

        if (!isQuitting) {
            event.preventDefault();

            let hideNotification = false;
            let closeBehavior = 'minimize';
            try {
                const settings = await readWindowSettings();
                hideNotification = Boolean(settings.hideMinimizeNotification);
                closeBehavior = String(settings.closeBehavior || 'minimize');
            } catch (err) {
                console.error('Failed to read window settings:', err);
            }

            if (closeBehavior === 'exit') {
                isQuitting = true;
                backendManager.kill();
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
                        const settings = await readWindowSettings();
                        settings.hideMinimizeNotification = true;
                        await writeWindowSettings(settings);
                    } catch (err) {
                        console.error('Failed to save window settings:', err);
                    }
                }
            }

            mainWindow?.hide();
        }
        return false;
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);

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
        void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// Register IPC handlers
ipcMain.handle('open-directory', async () => {
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return canceled ? null : filePaths[0];
});

ipcMain.handle('open-path', async (_event, filePath: string) => {
    if (!filePath) return { success: false, error: 'No path provided' };

    const normalizedPath = path.normalize(filePath);
    try {
        const stat = await fs.promises.stat(normalizedPath);
        if (stat.isDirectory()) {
            const error = await shell.openPath(normalizedPath);
            if (error) return { success: false, error };
        } else {
            shell.showItemInFolder(normalizedPath);
        }
        return { success: true };
    } catch (err) {
        console.error('Failed to open/show path:', err);
        return { success: false, error: String(err) };
    }
});

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

ipcMain.handle('get-close-behavior', async () => {
    try {
        const settings = await readWindowSettings();
        return settings.closeBehavior || 'minimize';
    } catch (err) {
        console.error('Failed to read close behavior:', err);
        return 'minimize';
    }
});

ipcMain.handle('set-close-behavior', async (_event, behavior: 'minimize' | 'exit') => {
    try {
        const settings = await readWindowSettings();
        settings.closeBehavior = behavior;
        await writeWindowSettings(settings);
        return true;
    } catch (err) {
        console.error('Failed to save close behavior:', err);
        return false;
    }
});

ipcMain.handle('get-backend-status', () => {
    return backendManager.getStatus();
});

ipcMain.handle('restart-backend', async () => {
    return await backendManager.restart();
});

ipcMain.handle('set-backend-port', async (_event, port: number) => {
    return await backendManager.setPort(port);
});

ipcMain.handle('open-backend-logs', async () => {
    return await backendManager.openBackendLogs();
});

ipcMain.handle('open-logs-directory', async () => {
    return await backendManager.openLogsDirectory();
});

ipcMain.handle('get-monitors', async (_event, forceRefresh?: boolean) => {
    return await getOrderedDisplays(Boolean(forceRefresh));
});

ipcMain.handle('get-system-wallpapers', async () => {
    return await getSystemWallpapers();
});

ipcMain.handle('get-vault-registry', () => {
    return vaultRegistryManager?.getRegistry() || { activeVaultId: 'local-vault', vaults: [] };
});

ipcMain.handle('get-active-vault', () => {
    return vaultRegistryManager?.getActiveVault();
});

ipcMain.handle('set-active-vault', async (_event, vaultId: string) => {
    return await vaultRegistryManager?.setActiveVault(vaultId);
});

ipcMain.handle('add-vault', async (_event, payload: { label: string; url: string; apiKey?: string }) => {
    return await vaultRegistryManager?.addVault(payload);
});

ipcMain.handle('update-vault', async (_event, id: string, updates: Partial<{ label: string; url: string; apiKey: string }>) => {
    return await vaultRegistryManager?.updateVault(id, updates);
});

ipcMain.handle('remove-vault', async (_event, id: string) => {
    return await vaultRegistryManager?.removeVault(id);
});

ipcMain.handle('test-vault-connection', async (_event, url: string, apiKey?: string) => {
    return await vaultRegistryManager?.testConnection(url, apiKey);
});

ipcMain.handle('set-wallpaper', async (_event, { imageId, monitorIndex, style }) => {
    const port = getBackendPort();
    const activeVault = vaultRegistryManager?.getActiveVault();
    const baseUrl = activeVault ? activeVault.url : `http://127.0.0.1:${port}`;
    const apiKey = activeVault?.apiKey || '';

    const parsedMonitorIndex = typeof monitorIndex === 'number' ? monitorIndex : parseInt(String(monitorIndex), 10);
    const effectiveStyle = style || 'fill';

    const tempDir = app.getPath('temp');
    const filename = `wallpaper-vault-active-monitor-${parsedMonitorIndex === -1 ? 'all' : parsedMonitorIndex}-id-${imageId}.jpg`;
    const tempPath = path.join(tempDir, filename);
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const fileUrl = `${cleanBaseUrl}/api/images/file/${imageId}`;

    return new Promise((resolve) => {
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(fileUrl);
        } catch (urlErr) {
            resolve({ success: false, error: String(urlErr) });
            return;
        }

        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;
        const headers: Record<string, string> = {};
        if (apiKey) {
            headers['X-API-Key'] = apiKey;
        }

        const fileStream = fs.createWriteStream(tempPath);
        fileStream.on('error', (err) => {
            console.error('[Main IPC] File write stream error:', err);
            resolve({ success: false, error: err.message });
        });
        const req = client.get(fileUrl, { headers }, (res) => {
            if (res.statusCode !== HTTP_STATUS_OK) {
                fileStream.close();
                console.error(`[Main IPC] Failed to fetch image ${imageId}, status code: ${res.statusCode}`);
                resolve({ success: false, error: `Failed to download image file (HTTP ${res.statusCode})` });
                return;
            }
            res.pipe(fileStream);
            fileStream.on('finish', async () => {
                fileStream.close();
                try {
                    const targetMonitorStr = parsedMonitorIndex === -1 ? 'all' : String(parsedMonitorIndex);
                    rotationCoordinator.recordManualWallpaper(targetMonitorStr, imageId);

                    await setWallpaperNatively(tempPath, parsedMonitorIndex, effectiveStyle);

                    const postData = JSON.stringify({
                        image_id: imageId,
                        target_monitor: targetMonitorStr,
                        style: effectiveStyle
                    });

                    const postReq = client.request({
                        hostname: parsedUrl.hostname,
                        port: parsedUrl.port || (isHttps ? HTTPS_DEFAULT_PORT : HTTP_DEFAULT_PORT),
                        path: '/api/rotation-history/set-wallpaper',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(postData),
                            ...(apiKey ? { 'X-API-Key': apiKey } : {})
                        }
                    }, (apiRes) => {
                        apiRes.resume();
                        rotationCoordinator.fetchCurrentWallpaperInfo(port);
                        resolve({ success: true });
                    });

                    postReq.on('error', (err) => {
                        console.error('[Main IPC] Failed to inform backend of wallpaper update:', err);
                        rotationCoordinator.fetchCurrentWallpaperInfo(port);
                        resolve({ success: true });
                    });

                    postReq.write(postData);
                    postReq.end();
                } catch (nativeErr: unknown) {
                    const errMsg = nativeErr instanceof Error ? nativeErr.message : 'Native wallpaper execution failed';
                    console.error('[Main IPC] setWallpaperNatively failed:', nativeErr);
                    resolve({ success: false, error: errMsg });
                }
            });
        });
        req.on('error', (err) => {
            console.error('[Main IPC] File download error:', err);
            fileStream.close();
            resolve({ success: false, error: err.message });
        });
    });
});

app.on('before-quit', () => {
    isQuitting = true;
    backendManager.kill();
    rotationCoordinator.stop();
    trayManager.destroy();
    vaultRegistryManager?.stopHealthMonitoring();
    psDaemon.kill();
});

app.whenReady().then(async () => {
    await loadInitialSettings();

    vaultRegistryManager = new VaultRegistryManager(getBackendPort);
    await vaultRegistryManager.loadRegistry();

    vaultRegistryManager.startHealthMonitoring((data) => {
        if (mainWindow && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('vault-registry-updated', data);
        }
    });

    await backendManager.start();
    createWindow();

    const TRAY_CREATION_DELAY_MS = 1000;
    setTimeout(() => {
        void trayManager.create();
    }, TRAY_CREATION_DELAY_MS);

    const notifyDisplaysChanged = () => {
        invalidateDisplayCache();

        BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
                win.webContents.send('displays-changed');
            }
        });

        if (!rotationCoordinator.isPaused()) {
            const port = getBackendPort();
            console.log('[Rotation Coordinator] Displays changed during active rotation. Refreshing rotation timers...');
            void rotationCoordinator.fetchRotationSettings(port).then((ok) => {
                if (ok) void rotationCoordinator.setupNativeTimers(port);
            });
        }
    };

    screen.on('display-added', () => {
        console.log('[Rotation Coordinator] Monitor added, invalidating layout cache...');
        notifyDisplaysChanged();
    });
    screen.on('display-removed', () => {
        console.log('[Rotation Coordinator] Monitor removed, invalidating layout cache...');
        notifyDisplaysChanged();
    });
    screen.on('display-metrics-changed', () => {
        console.log('[Rotation Coordinator] Monitor metrics changed, invalidating layout cache...');
        notifyDisplaysChanged();
    });

    powerMonitor.on('suspend', () => {
        console.log('[Rotation Coordinator] System suspending. Pausing native rotation timers...');
        setPowerStateSuspended(true);
        void rotationCoordinator.setupNativeTimers(getBackendPort());
    });

    powerMonitor.on('lock-screen', () => {
        console.log('[Rotation Coordinator] System screen locked. Pausing native rotation timers...');
        setPowerStateSuspended(true);
        void rotationCoordinator.setupNativeTimers(getBackendPort());
    });

    powerMonitor.on('resume', () => {
        console.log('[Rotation Coordinator] System resumed. Checking state...');
        setPowerStateSuspended(false);
        if (getPendingDisplayChange()) {
            console.log('[Rotation Coordinator] Pending display change found. Triggering displays changed notification.');
            setPendingDisplayChange(false);
            notifyDisplaysChanged();
        }
        const port = getBackendPort();
        void rotationCoordinator.fetchRotationSettings(port).then((ok) => {
            if (ok) void rotationCoordinator.setupNativeTimers(port);
        });
    });

    powerMonitor.on('unlock-screen', () => {
        console.log('[Rotation Coordinator] System unlocked. Checking state...');
        setPowerStateSuspended(false);
        if (getPendingDisplayChange()) {
            console.log('[Rotation Coordinator] Pending display change found. Triggering displays changed notification.');
            setPendingDisplayChange(false);
            notifyDisplaysChanged();
        }
        const port = getBackendPort();
        void rotationCoordinator.fetchRotationSettings(port).then((ok) => {
            if (ok) void rotationCoordinator.setupNativeTimers(port);
        });
    });
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        mainWindow?.show();
    }
});
