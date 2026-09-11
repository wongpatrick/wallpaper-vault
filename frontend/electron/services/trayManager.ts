/**
 * @file
 * System tray icon and context menu management service.
 * Manages tray icon decoding, monitor wallpaper indicators, and tray actions.
 */
import { app, Tray, Menu, nativeImage, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AppContext } from './appContext';
import type { RotationCoordinator } from './rotationCoordinator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class TrayManager {
    private context: AppContext;
    private coordinator: RotationCoordinator;
    private tray: Tray | null = null;

    constructor(context: AppContext, coordinator: RotationCoordinator) {
        this.context = context;
        this.coordinator = coordinator;
        this.coordinator.setMenuUpdateCallback(() => this.updateMenu());
    }

    public async create(): Promise<void> {
        console.log('--- Tray Creation ---');
        try {
            const publicDir = process.env.VITE_DEV_SERVER_URL
                ? path.resolve(__dirname, '../../public')
                : path.join(process.resourcesPath, 'public');

            console.log('Public Directory:', publicDir);

            const iconNames = ['vault-icon.png', 'vault-icon.ico', 'vault-tray.png', 'tray.png', 'vault-tray.ico', 'tray.ico'];
            let trayIcon: Electron.NativeImage | null = null;

            for (const name of iconNames) {
                const iconPath = path.join(publicDir, name);
                let buffer: Buffer;
                try {
                    buffer = await fs.promises.readFile(iconPath);
                } catch {
                    continue;
                }

                try {
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

            if (this.tray) this.tray.destroy();
            this.tray = new Tray(trayIcon);

            this.tray.setToolTip('Wallpaper Vault');
            this.updateMenu();

            this.tray.on('click', () => {
                const mainWindow = this.context.getMainWindow();
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

    public updateMenu(): void {
        if (!this.tray) return;
        const isPaused = this.coordinator.isPaused();
        const activeWallpapers = this.coordinator.getActiveMonitorWallpapers();

        const headerItems: MenuItemConstructorOptions[] = [];

        const numericKeys = Array.from(activeWallpapers.keys())
            .filter((k) => !isNaN(parseInt(k, 10)))
            .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

        if (numericKeys.length > 0) {
            numericKeys.forEach((key) => {
                const index = parseInt(key, 10);
                const info = activeWallpapers.get(key);
                if (info) {
                    headerItems.push({
                        label: `M${index + 1}: ${info.title} by ${info.author}`,
                        enabled: false
                    });
                }
            });
        } else if (activeWallpapers.has('global')) {
            const info = activeWallpapers.get('global')!;
            headerItems.push({
                label: `M1: ${info.title} by ${info.author}`,
                enabled: false
            });
        } else {
            headerItems.push({
                label: 'M1: Unknown Wallpaper',
                enabled: false
            });
        }

        const contextMenu = Menu.buildFromTemplate([
            ...headerItems,
            { type: 'separator' },
            {
                label: '⏭️ Next Wallpaper',
                click: () => {
                    this.coordinator.triggerSkipViaApi();
                }
            },
            {
                label: isPaused ? '▶️ Resume Rotation' : '⏸️ Pause Rotation',
                click: () => {
                    this.coordinator.togglePauseStateViaApi();
                }
            },
            { type: 'separator' },
            {
                label: 'Show App',
                click: () => {
                    const mainWindow = this.context.getMainWindow();
                    mainWindow?.show();
                    mainWindow?.focus();
                }
            },
            {
                label: 'Quit',
                click: () => {
                    this.context.setQuitting(true);
                    app.quit();
                }
            }
        ]);
        this.tray.setContextMenu(contextMenu);
    }

    public destroy(): void {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }
}
