/**
 * @file
 * Desktop rotation coordinator service.
 * Manages SSE streams, native rotation timers, active wallpaper tracking, and desktop notifications.
 */
/* eslint-disable no-magic-numbers, @typescript-eslint/no-explicit-any */
import { Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { exec } from 'node:child_process';
import { app } from 'electron';
import { type AppContext, DEFAULT_PORT, HTTP_STATUS_OK } from './appContext';
import { psDaemon } from './powerShellDaemon';
import {
    getOrderedDisplays,
    setWallpaperNatively,
    getPowerStateSuspended
} from './monitorLayout';

export interface MonitorRotationConfig {
    mode: 'displayfusion' | 'native';
    interval: number;
    source: 'entire_library' | 'playlist';
    playlistId: string;
    favoriteProbability: number;
    enabled: boolean;
    style: 'fill' | 'fit' | 'stretch' | 'tile' | 'center' | 'span';
}

export interface GlobalRotationConfig {
    mode: 'displayfusion' | 'native';
    interval: number;
    source: 'entire_library' | 'playlist';
    playlistId: string;
    favoriteProbability: number;
    style: 'fill' | 'fit' | 'stretch' | 'tile' | 'center' | 'span';
    paused: boolean;
}

export class RotationCoordinator {
    private context: AppContext;
    private activeSsePort: number | null = null;
    private activeSseRequest: http.ClientRequest | null = null;
    private sseReconnectTimeout: NodeJS.Timeout | null = null;
    private isStopped = false;
    private nativeRotationTimers: Map<number, NodeJS.Timeout> = new Map();
    private activeMonitorWallpapers: Map<string, { title: string; author: string }> = new Map();
    private recentlyAppliedManualWallpapers: Map<string, number> = new Map();
    private rotationNotificationsEnabled = true;

    private globalRotationConfig: GlobalRotationConfig = {
        mode: 'displayfusion',
        interval: 15,
        source: 'entire_library',
        playlistId: '',
        favoriteProbability: 0.4,
        style: 'fill',
        paused: false
    };

    private monitorConfigs: Map<number, MonitorRotationConfig> = new Map();
    private onMenuUpdateCallback?: () => void;

    constructor(context: AppContext, onMenuUpdate?: () => void) {
        this.context = context;
        this.onMenuUpdateCallback = onMenuUpdate;
    }

    public setMenuUpdateCallback(callback: () => void): void {
        this.onMenuUpdateCallback = callback;
    }

    public getActiveMonitorWallpapers(): Map<string, { title: string; author: string }> {
        return this.activeMonitorWallpapers;
    }

    public getGlobalConfig(): GlobalRotationConfig {
        return this.globalRotationConfig;
    }

    public isPaused(): boolean {
        return this.globalRotationConfig.paused;
    }

    public recordManualWallpaper(targetMonitor: string, imageId: number): void {
        this.recentlyAppliedManualWallpapers.set(targetMonitor, imageId);
    }

    public fetchCurrentWallpaperInfo(port: number): void {
        const url = `http://127.0.0.1:${port}/api/rotation-history/current-monitors`;
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    if (res.statusCode === HTTP_STATUS_OK) {
                        const monitorsObj = JSON.parse(data);
                        this.activeMonitorWallpapers.clear();

                        if (monitorsObj && typeof monitorsObj === 'object') {
                            Object.keys(monitorsObj).forEach((key) => {
                                const img = monitorsObj[key];
                                if (img) {
                                    const title = img.set_title || img.filename || 'Unknown Title';
                                    const creators = img.creator_names || [];
                                    const author = Array.isArray(creators) && creators.length > 0 ? creators.join(', ') : 'Unknown Author';
                                    this.activeMonitorWallpapers.set(key, { title, author });
                                }
                            });
                        }
                        this.onMenuUpdateCallback?.();
                    }
                } catch {
                    // ignore parsing error
                }
            });
        }).on('error', () => {});
    }

    private showWallpaperNotification(): void {
        try {
            if (!Notification.isSupported()) return;

            const lines: string[] = [];
            const numericKeys = Array.from(this.activeMonitorWallpapers.keys())
                .filter((k) => !isNaN(parseInt(k, 10)))
                .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

            if (numericKeys.length > 0) {
                numericKeys.forEach((key) => {
                    const index = parseInt(key, 10);
                    const info = this.activeMonitorWallpapers.get(key);
                    if (info) {
                        lines.push(`M${index + 1}: ${info.title} by ${info.author}`);
                    }
                });
            } else if (this.activeMonitorWallpapers.has('global')) {
                const info = this.activeMonitorWallpapers.get('global')!;
                lines.push(`M1: ${info.title} by ${info.author}`);
            }

            const body = lines.join(' | ');

            const notification = new Notification({
                title: 'Wallpaper Changed',
                body: body || 'Updated desktop background',
                silent: false
            });
            notification.on('click', () => {
                const mainWindow = this.context.getMainWindow();
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.show();
                    mainWindow.focus();
                }
            });
            notification.show();
        } catch (err) {
            console.error('[Rotation Coordinator] Failed to display desktop notification:', err);
        }
    }

    private fetchActiveRotationRule(port: number): Promise<any> {
        return new Promise((resolve) => {
            const url = `http://127.0.0.1:${port}/api/rotation-rules/active`;
            http.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const rule = JSON.parse(data);
                        resolve(rule && rule.id ? rule : null);
                    } catch {
                        resolve(null);
                    }
                });
            }).on('error', () => {
                resolve(null);
            });
        });
    }

    public async fetchRotationSettings(port: number): Promise<boolean> {
        const displays = await getOrderedDisplays();
        return new Promise((resolve) => {
            const url = `http://127.0.0.1:${port}/api/settings/`;
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

                            this.globalRotationConfig = {
                                mode: String(getVal('wallpaper_rotation_mode', 'displayfusion')) as any,
                                interval: parseInt(String(getVal('wallpaper_rotation_interval', '15')), 10) || 15,
                                source: String(getVal('wallpaper_rotation_source', 'entire_library')) as any,
                                playlistId: String(getVal('wallpaper_rotation_playlist_id', '')),
                                favoriteProbability: parseFloat(String(getVal('favorite_rotation_probability', '0.4'))) || 0.4,
                                style: String(getVal('wallpaper_rotation_style', 'fill')) as any,
                                paused: String(getVal('wallpaper_rotation_paused', 'false')) === 'true'
                            };
                            this.rotationNotificationsEnabled = String(getVal('wallpaper_rotation_notifications_enabled', 'true')) !== 'false';
                            this.fetchCurrentWallpaperInfo(port);

                            void this.fetchActiveRotationRule(port).then((activeRule) => {
                                if (activeRule) {
                                    console.log(`[Rotation Coordinator] Applying active scheduled rule override: "${activeRule.name}"`);
                                    this.globalRotationConfig.source = activeRule.source;
                                    if (activeRule.playlist_id) {
                                        this.globalRotationConfig.playlistId = String(activeRule.playlist_id);
                                    }
                                    if (activeRule.style) {
                                        this.globalRotationConfig.style = activeRule.style;
                                    }
                                }

                                this.monitorConfigs.clear();

                                displays.forEach((display) => {
                                    const index = display.index;
                                    const overrideVal = getVal(`monitor_${index}_override_enabled`, false);
                                    const overrideEnabled = overrideVal === true || String(overrideVal) === 'true';

                                    this.monitorConfigs.set(index, {
                                        enabled: overrideEnabled,
                                        mode: (overrideEnabled ? String(getVal(`monitor_${index}_wallpaper_rotation_mode`, this.globalRotationConfig.mode)) : this.globalRotationConfig.mode) as any,
                                        interval: overrideEnabled ? (parseInt(String(getVal(`monitor_${index}_wallpaper_rotation_interval`, String(this.globalRotationConfig.interval))), 10) || 15) : this.globalRotationConfig.interval,
                                        source: (overrideEnabled ? String(getVal(`monitor_${index}_wallpaper_rotation_source`, this.globalRotationConfig.source)) : this.globalRotationConfig.source) as any,
                                        playlistId: overrideEnabled ? String(getVal(`monitor_${index}_wallpaper_rotation_playlist_id`, this.globalRotationConfig.playlistId)) : this.globalRotationConfig.playlistId,
                                        favoriteProbability: overrideEnabled ? (parseFloat(String(getVal(`monitor_${index}_favorite_rotation_probability`, String(this.globalRotationConfig.favoriteProbability)))) || 0.4) : this.globalRotationConfig.favoriteProbability,
                                        style: (overrideEnabled ? String(getVal(`monitor_${index}_wallpaper_rotation_style`, this.globalRotationConfig.style)) : this.globalRotationConfig.style) as any
                                    });
                                });
                                this.onMenuUpdateCallback?.();
                                resolve(true);
                            });
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

    public async setupNativeTimers(port: number): Promise<void> {
        this.nativeRotationTimers.forEach((timer) => clearInterval(timer));
        this.nativeRotationTimers.clear();

        if (this.globalRotationConfig.paused || getPowerStateSuspended()) {
            console.log('[Rotation Coordinator] Native rotation timers bypassed (paused or system suspended).');
            return;
        }

        const displays = await getOrderedDisplays();
        let hasOverrides = false;

        displays.forEach((display) => {
            const index = display.index;
            const config = this.monitorConfigs.get(index);
            if (config && config.enabled) {
                hasOverrides = true;
                if (config.mode === 'native') {
                    const intervalMs = config.interval * 60 * 1000;
                    console.log(`[Rotation Coordinator] Spawning timer for Monitor ${index + 1} (${config.interval} mins)`);
                    const timer = setInterval(() => {
                        void this.triggerNativeRotation(port, index);
                    }, intervalMs);
                    this.nativeRotationTimers.set(index, timer);
                }
            }
        });

        if (!hasOverrides && this.globalRotationConfig.mode === 'native') {
            const intervalMs = this.globalRotationConfig.interval * 60 * 1000;
            console.log(`[Rotation Coordinator] No overrides. Spawning global native timer (${this.globalRotationConfig.interval} mins)`);
            const timer = setInterval(() => {
                void this.triggerNativeRotation(port, -1);
            }, intervalMs);
            this.nativeRotationTimers.set(-1, timer);
        }
    }

    public async triggerNativeRotation(port: number, monitorIndex: number): Promise<void> {
        try {
            const isFullscreenRaw = await psDaemon.run('[FullscreenHelper]::IsFullscreen()');
            if (isFullscreenRaw.trim().toLowerCase() === 'true') {
                console.log(`[Rotation Coordinator] Fullscreen/Game active. Deferring rotation for Monitor ${monitorIndex === -1 ? 'All' : monitorIndex + 1}.`);
                return;
            }
        } catch (err) {
            console.warn('[Rotation Coordinator] Fullscreen/Game check failed:', err);
        }

        if (monitorIndex === -1) {
            const displays = await getOrderedDisplays();
            displays.forEach((display) => {
                void this.triggerNativeRotation(port, display.index);
            });
            return;
        }

        console.log(`[Rotation Coordinator] Triggering native rotation for Monitor ${monitorIndex + 1}...`);

        const config = this.monitorConfigs.get(monitorIndex) || this.globalRotationConfig;

        let randomUrl = `/api/images/random`;
        if (config.source === 'playlist' && config.playlistId) {
            randomUrl = `/api/playlists/${config.playlistId}/random`;
        }

        const params = new URLSearchParams();
        if (config.favoriteProbability !== undefined) {
            params.append('favorite_probability', String(config.favoriteProbability));
        }
        params.append('target_monitor', String(monitorIndex));

        const displays = await getOrderedDisplays();
        const display = displays.find(d => d.index === monitorIndex);
        if (display) {
            const { width, height } = display.bounds;
            const orientation = width > height ? 'landscape' : 'portrait';
            params.append('orientation', orientation);
            console.log(`[Rotation Coordinator] Auto-detected orientation for Monitor ${monitorIndex + 1}: ${orientation} (${width}x${height})`);
        }

        const url = `http://127.0.0.1:${port}${randomUrl}?${params.toString()}`;
        http.get(url, (res) => {
            res.resume();
        }).on('error', (err) => {
            console.error('[Rotation Coordinator] Failed to trigger rotation:', err);
        });
    }

    public handleSkipEvent(port: number, targetMonitor: string): void {
        console.log(`[Rotation Coordinator] Skip event triggered for monitor target: ${targetMonitor}`);

        void this.fetchRotationSettings(port).then((ok) => {
            if (ok) {
                void this.setupNativeTimers(port);
            }

            if (targetMonitor === 'all') {
                if (this.globalRotationConfig.mode === 'displayfusion') {
                    void this.executeDisplayFusionSkip();
                } else {
                    void this.triggerNativeRotation(port, -1);
                }
            } else {
                const index = parseInt(targetMonitor, 10);
                const config = this.monitorConfigs.get(index) || this.globalRotationConfig;

                if (config.mode === 'displayfusion') {
                    void this.executeDisplayFusionSkip();
                } else {
                    void this.triggerNativeRotation(port, index);
                }
            }
        });
    }

    private async executeDisplayFusionSkip(): Promise<void> {
        const paths = [
            'C:\\Program Files\\DisplayFusion\\DisplayFusionCommand.exe',
            'C:\\Program Files (x86)\\DisplayFusion\\DisplayFusionCommand.exe'
        ];
        let exePath = '';
        for (const p of paths) {
            try {
                await fs.promises.access(p);
                exePath = p;
                break;
            } catch {
                // Not found
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

    public handleRotationEvent(port: number, image: any, targetMonitor: string): void {
        console.log(`[Rotation Coordinator] Rotation event for image ID ${image?.id} on target monitor: ${targetMonitor}`);

        if (image) {
            const title = image.set_title || image.filename || 'Wallpaper';
            const creators = image.creator_names || [];
            const author = Array.isArray(creators) && creators.length > 0 ? creators.join(', ') : 'Unknown Creator';

            if (targetMonitor === 'all') {
                this.activeMonitorWallpapers.set('global', { title, author });
                if (this.activeMonitorWallpapers.size > 1) {
                    Array.from(this.activeMonitorWallpapers.keys()).forEach((k) => {
                        if (k !== 'global') {
                            this.activeMonitorWallpapers.set(k, { title, author });
                        }
                    });
                }
            } else {
                this.activeMonitorWallpapers.set(targetMonitor, { title, author });
            }

            this.onMenuUpdateCallback?.();

            if (this.rotationNotificationsEnabled) {
                this.showWallpaperNotification();
            }
        }

        if (image && this.recentlyAppliedManualWallpapers.get(targetMonitor) === image.id) {
            console.log(`[Rotation Coordinator] Bypassing duplicate native apply for image ID ${image.id} on ${targetMonitor} (manually applied).`);
            this.recentlyAppliedManualWallpapers.delete(targetMonitor);
            return;
        }

        if (targetMonitor === 'all') {
            if (this.globalRotationConfig.mode === 'native') {
                void this.applyNativeWallpaper(port, image, -1);
            }
        } else {
            const index = parseInt(targetMonitor, 10);
            const config = this.monitorConfigs.get(index) || this.globalRotationConfig;

            if (config.mode === 'native') {
                void this.applyNativeWallpaper(port, image, index);
            }
        }
    }

    private async applyNativeWallpaper(port: number, image: any, monitorIndex: number): Promise<void> {
        const tempDir = app.getPath('temp');
        const filename = `wallpaper-vault-active-monitor-${monitorIndex === -1 ? 'all' : monitorIndex}-id-${image.id}.jpg`;
        const tempPath = path.join(tempDir, filename);

        try {
            const files = await fs.promises.readdir(tempDir);
            const prefix = `wallpaper-vault-active-monitor-${monitorIndex === -1 ? 'all' : monitorIndex}-id-`;
            await Promise.all(
                files.map(async (file) => {
                    if (file.startsWith(prefix) && !file.endsWith(`-id-${image.id}.jpg`)) {
                        try {
                            await fs.promises.unlink(path.join(tempDir, file));
                        } catch {
                            // ignore cleanup error
                        }
                    }
                })
            );
        } catch (err) {
            console.warn('[Rotation Coordinator] Failed to clean up old temp files:', err);
        }

        const fileUrl = `http://127.0.0.1:${port}/api/images/file/${image.id}`;
        console.log(`[Rotation Coordinator] Downloading active image for Monitor ${monitorIndex === -1 ? 'Global' : monitorIndex + 1} to ${tempPath}`);

        const config = monitorIndex === -1 ? this.globalRotationConfig : (this.monitorConfigs.get(monitorIndex) || this.globalRotationConfig);
        const style = config.style || 'fill';

        const fileStream = fs.createWriteStream(tempPath);
        fileStream.on('error', (err) => {
            console.error('[Rotation Coordinator] File write stream error:', err);
        });
        http.get(fileUrl, (res) => {
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                void setWallpaperNatively(tempPath, monitorIndex, style).catch((err) => {
                    console.error('[Rotation Coordinator] Native wallpaper apply failed:', err);
                });
            });
        }).on('error', (err) => {
            console.error('[Rotation Coordinator] File download error:', err);
            fileStream.close();
        });
    }

    public start(port: number): void {
        this.isStopped = false;
        if (this.sseReconnectTimeout) {
            clearTimeout(this.sseReconnectTimeout);
            this.sseReconnectTimeout = null;
        }
        if (this.activeSsePort === port) {
            return;
        }
        this.activeSsePort = port;

        if (this.activeSseRequest) {
            this.activeSseRequest.destroy();
            this.activeSseRequest = null;
        }

        const scheduleReconnect = () => {
            if (this.isStopped || this.context.isQuitting()) return;
            if (!this.sseReconnectTimeout) {
                this.activeSsePort = null;
                this.sseReconnectTimeout = setTimeout(() => {
                    this.sseReconnectTimeout = null;
                    if (!this.isStopped && !this.context.isQuitting()) {
                        this.start(port);
                    }
                }, 5000);
            }
        };

        void this.fetchRotationSettings(port).then((ok) => {
            if (this.isStopped || this.context.isQuitting()) return;
            if (ok) {
                void this.setupNativeTimers(port);
            }

            const url = `http://127.0.0.1:${port}/api/rotation-history/events`;
            console.log(`[Rotation Coordinator] Connecting to SSE at ${url}`);

            this.activeSseRequest = http.get(url, (res) => {
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
                                    this.handleSkipEvent(port, data.target_monitor || 'all');
                                } else if (data.event === 'rotation') {
                                    this.handleRotationEvent(port, data.image, data.target_monitor || 'all');
                                } else if (data.event === 'ping') {
                                    void this.fetchRotationSettings(port).then((okVal) => {
                                        if (okVal) void this.setupNativeTimers(port);
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
                    scheduleReconnect();
                });
            });

            this.activeSseRequest.on('error', (err) => {
                console.error('[Rotation Coordinator] SSE error:', err);
                scheduleReconnect();
            });
        });
    }

    public triggerSkipViaApi(port?: number): void {
        const targetPort = port || this.activeSsePort || this.context.getBackendPort() || DEFAULT_PORT;
        void this.context.logToCombined(`[Tray] Skipping wallpaper via API request to port ${targetPort}...`);
        const req = http.request({
            hostname: '127.0.0.1',
            port: targetPort,
            path: `/api/rotation-history/skip`,
            method: 'POST'
        }, (res) => {
            res.resume();
        });
        req.on('error', (err) => {
            console.error('[Tray] API request failed to trigger skip:', err);
        });
        req.end();
    }

    public togglePauseStateViaApi(): void {
        const port = this.activeSsePort || this.context.getBackendPort() || DEFAULT_PORT;
        const nextPaused = !this.globalRotationConfig.paused;
        const data = JSON.stringify({ value: String(nextPaused) });

        void this.context.logToCombined(`[Tray] Toggling pause state via API request to port ${port}...`);

        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: `/api/settings/wallpaper_rotation_paused`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        }, (res) => {
            res.on('data', () => {});
            res.on('end', () => {
                void this.context.logToCombined(`[Tray] API response status: ${res.statusCode}. Toggled pause state.`);
                if (res.statusCode === HTTP_STATUS_OK) {
                    void this.fetchRotationSettings(port).then((ok) => {
                        if (ok) void this.setupNativeTimers(port);
                    });
                }
            });
        });

        req.on('error', (err) => {
            console.error('[Tray] API request failed to toggle pause state:', err);
        });

        req.write(data);
        req.end();
    }

    public stop(): void {
        this.isStopped = true;
        if (this.sseReconnectTimeout) {
            clearTimeout(this.sseReconnectTimeout);
            this.sseReconnectTimeout = null;
        }
        if (this.activeSseRequest) {
            this.activeSseRequest.destroy();
            this.activeSseRequest = null;
        }
        this.activeSsePort = null;
        this.nativeRotationTimers.forEach((timer) => clearInterval(timer));
        this.nativeRotationTimers.clear();
    }
}
