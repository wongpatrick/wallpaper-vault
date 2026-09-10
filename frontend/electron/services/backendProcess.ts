/**
 * @file
 * Backend process lifecycle and health monitoring service.
 * Handles spawning the FastAPI backend, health pinging, crash recovery, and log access.
 */
import { app, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import {
    type AppContext,
    type BackendStatusInfo,
    DEFAULT_PORT,
    STARTUP_TIMEOUT_MS,
    HEARTBEAT_STARTUP_INTERVAL_MS,
    HEARTBEAT_RUNNING_INTERVAL_MS,
    PING_TIMEOUT_MS,
    RESTART_ATTEMPT_DELAY_MS,
    RESTART_MANUAL_DELAY_MS,
    HTTP_STATUS_OK,
    MAX_AUTO_RESTARTS,
    logBoth,
    logBothToCombined,
    setBackendPortSetting
} from './appContext';

export class BackendProcessManager {
    private context: AppContext;
    private backendProcess: ChildProcess | null = null;
    private currentStatus: BackendStatusInfo = {
        status: 'stopped',
        autoRestartCount: 0,
        maxRestarts: MAX_AUTO_RESTARTS,
        port: DEFAULT_PORT
    };
    private monitorTimeout: NodeJS.Timeout | null = null;
    private startupTimeout: NodeJS.Timeout | null = null;
    private restartTimeout: NodeJS.Timeout | null = null;
    private consecutiveFailures = 0;
    private onRunningCallback?: (port: number) => void;

    constructor(context: AppContext, onRunning?: (port: number) => void) {
        this.context = context;
        this.onRunningCallback = onRunning;
        this.currentStatus.port = this.context.getBackendPort();
    }

    public getStatus(): BackendStatusInfo {
        return this.currentStatus;
    }

    public updateStatus(newStatus: Partial<BackendStatusInfo>): void {
        const port = this.context.getBackendPort();
        this.currentStatus = { ...this.currentStatus, ...newStatus, port };
        console.log(`[Backend Status Change] ${this.currentStatus.status} on port ${this.currentStatus.port}`);

        if (newStatus.status === 'starting') {
            if (this.startupTimeout) clearTimeout(this.startupTimeout);
            this.startupTimeout = setTimeout(() => {
                if (this.currentStatus.status === 'starting') {
                    void logBothToCombined('ERROR: Startup timeout exceeded. Backend failed to respond within 20s.');
                    this.updateStatus({
                        status: 'error',
                        errorDetails: 'Backend took too long to start (timeout exceeded).'
                    });
                    if (this.backendProcess) {
                        this.backendProcess.kill();
                        this.backendProcess = null;
                    }
                }
            }, STARTUP_TIMEOUT_MS);
        } else if (newStatus.status && newStatus.status !== 'starting') {
            if (this.startupTimeout) {
                clearTimeout(this.startupTimeout);
                this.startupTimeout = null;
            }
        }

        const mainWindow = this.context.getMainWindow();
        if (mainWindow && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('backend-status-change', this.currentStatus);

            if (this.currentStatus.status === 'error' || this.currentStatus.status === 'port-collision') {
                mainWindow.show();
                mainWindow.focus();
            }
        }

        if (this.currentStatus.status === 'running') {
            this.onRunningCallback?.(this.currentStatus.port);
        }
    }

    private checkPortOccupied(port: number): Promise<boolean> {
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

    private pingBackend(port: number): Promise<boolean> {
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

    private startMonitorLoop(): void {
        if (this.monitorTimeout) clearTimeout(this.monitorTimeout);
        this.consecutiveFailures = 0;

        const runCheck = async () => {
            const port = this.context.getBackendPort();
            const isHealthy = await this.pingBackend(port);

            if (isHealthy) {
                this.consecutiveFailures = 0;
                if (this.currentStatus.status === 'starting' || this.currentStatus.status === 'stopped' || this.currentStatus.status === 'error') {
                    this.updateStatus({ status: 'running', autoRestartCount: 0, errorDetails: undefined });
                }
            } else {
                if (this.currentStatus.status === 'running') {
                    this.consecutiveFailures++;
                    console.warn(`[Monitor] Heartbeat failed (${this.consecutiveFailures}/3)`);
                    if (this.consecutiveFailures >= 3) {
                        this.consecutiveFailures = 0;
                        void logBothToCombined('ERROR: Heartbeat failed 3 times consecutively. Restarting backend...');
                        this.handleBackendCrash('Backend became unresponsive');
                    }
                }
            }

            const delay = this.currentStatus.status === 'starting'
                ? HEARTBEAT_STARTUP_INTERVAL_MS
                : HEARTBEAT_RUNNING_INTERVAL_MS;

            this.monitorTimeout = setTimeout(runCheck, delay);
        };

        void runCheck();
    }

    private handleBackendCrash(reason: string): void {
        if (this.context.isQuitting()) return;

        if (process.env.VITE_DEV_SERVER_URL) {
            this.updateStatus({ status: 'stopped', errorDetails: `Backend unreachable: ${reason}` });
            return;
        }

        if (this.currentStatus.autoRestartCount < this.currentStatus.maxRestarts) {
            const newCount = this.currentStatus.autoRestartCount + 1;
            this.updateStatus({
                status: 'starting',
                autoRestartCount: newCount,
                errorDetails: `Crashed/Unresponsive: ${reason}. Restart attempt ${newCount}/${this.currentStatus.maxRestarts}...`
            });

            if (this.restartTimeout) clearTimeout(this.restartTimeout);
            this.restartTimeout = setTimeout(() => {
                this.restartTimeout = null;
                void this.spawnBackendProcess();
            }, RESTART_ATTEMPT_DELAY_MS);
        } else {
            this.updateStatus({
                status: 'error',
                errorDetails: `Backend crashed repeatedly. ${reason}`
            });
        }
    }

    private async spawnBackendProcess(): Promise<void> {
        if (this.context.isQuitting()) return;

        const userDataPath = app.getPath('userData');
        const logsDir = path.join(userDataPath, 'logs');
        await fs.promises.mkdir(logsDir, { recursive: true });
        const logFilePath = path.join(logsDir, 'combined.log');

        const resourcesPath = process.resourcesPath;
        const backendPath = path.join(resourcesPath, 'backend');

        // Relocate database to userData to prevent data loss on updates
        const userDbDir = path.join(userDataPath, 'db');
        await fs.promises.mkdir(userDbDir, { recursive: true });
        const userDbPath = path.join(userDbDir, 'wallpapers.db');

        const templateDbPath = path.join(resourcesPath, 'db', 'wallpapers.db');
        let userDbExists = false;
        try {
            await fs.promises.access(userDbPath);
            userDbExists = true;
        } catch {
            userDbExists = false;
        }

        if (!userDbExists) {
            void logBoth(logFilePath, `Database not found in userData. Copying template from ${templateDbPath} to ${userDbPath}`);
            try {
                await fs.promises.copyFile(templateDbPath, userDbPath);
                void logBoth(logFilePath, 'Database template copied successfully.');
            } catch (error) {
                void logBoth(logFilePath, `ERROR: Failed to copy template database: ${error}`);
            }
        } else {
            void logBoth(logFilePath, `Using existing database in userData: ${userDbPath}`);
        }

        const env = {
            ...process.env,
            DATABASE_URL: `sqlite+aiosqlite:///${userDbPath.replace(/\\/g, '/')}`
        };

        const port = this.context.getBackendPort();
        const portStr = port.toString();

        try {
            const binaryPath = path.join(backendPath, 'wallpaper-vault-backend.exe');
            let binaryExists = false;
            try {
                await fs.promises.access(binaryPath);
                binaryExists = true;
            } catch {
                binaryExists = false;
            }

            if (binaryExists) {
                void logBoth(logFilePath, `Compiled backend found at ${binaryPath}. Spawning backend binary on port ${portStr}...`);
                this.backendProcess = spawn(binaryPath, ['--port', portStr], {
                    cwd: backendPath,
                    env,
                    shell: false
                });
            } else {
                void logBoth(logFilePath, `Compiled backend not found at ${binaryPath}. Falling back to uv run uvicorn on port ${portStr}...`);
                this.backendProcess = spawn('uv', ['run', 'uvicorn', 'app.main:app', '--port', portStr], {
                    cwd: backendPath,
                    env,
                    shell: true
                });
            }

            const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
            logStream.on('error', (err) => {
                console.error('[Backend Process] Log write stream error:', err);
            });
            this.backendProcess.stdout?.pipe(logStream);
            this.backendProcess.stderr?.pipe(logStream);

            this.backendProcess.on('close', (code) => {
                void logBoth(logFilePath, `Backend process exited with code ${code}`);
                this.backendProcess = null;
                if (!this.context.isQuitting()) {
                    this.handleBackendCrash(`Backend process exited with code ${code}`);
                }
            });
        } catch (error) {
            void logBoth(logFilePath, `Failed to start backend process: ${error}`);
            this.handleBackendCrash(`Spawn error: ${error}`);
        }
    }

    public async start(): Promise<void> {
        if (this.monitorTimeout) clearTimeout(this.monitorTimeout);
        if (this.startupTimeout) clearTimeout(this.startupTimeout);

        const port = this.context.getBackendPort();

        if (process.env.VITE_DEV_SERVER_URL) {
            console.log('Running in development mode, backend should be started externally.');
            this.updateStatus({ status: 'starting' });
            this.startMonitorLoop();
            return;
        }

        void logBothToCombined('Starting production backend check...');

        const isOccupied = await this.checkPortOccupied(port);
        if (isOccupied) {
            void logBothToCombined(`ERROR: Port ${port} is already in use by another process.`);
            this.updateStatus({ status: 'port-collision', errorDetails: `Port ${port} is occupied by another application.` });
            return;
        }

        this.updateStatus({ status: 'starting' });
        await this.spawnBackendProcess();
        this.startMonitorLoop();
    }

    public async restart(): Promise<boolean> {
        void logBothToCombined('User requested manual backend restart.');
        this.updateStatus({ status: 'starting', autoRestartCount: 0, errorDetails: undefined });
        if (this.backendProcess) {
            this.backendProcess.kill();
            this.backendProcess = null;
        }
        setTimeout(() => {
            void this.start();
        }, RESTART_MANUAL_DELAY_MS);
        return true;
    }

    public async setPort(port: number): Promise<boolean> {
        return await setBackendPortSetting(port);
    }

    public async openBackendLogs(): Promise<boolean> {
        const userDataPath = app.getPath('userData');
        const logFilePath = path.join(userDataPath, 'logs', 'combined.log');
        try {
            await fs.promises.access(logFilePath);
            await shell.openPath(logFilePath);
            return true;
        } catch {
            return false;
        }
    }

    public async openLogsDirectory(): Promise<boolean> {
        const userDataPath = app.getPath('userData');
        const logsDir = path.join(userDataPath, 'logs');
        try {
            await fs.promises.access(logsDir);
            await shell.openPath(logsDir);
            return true;
        } catch {
            return false;
        }
    }

    public kill(): void {
        if (this.monitorTimeout) clearTimeout(this.monitorTimeout);
        if (this.startupTimeout) clearTimeout(this.startupTimeout);
        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout);
            this.restartTimeout = null;
        }
        if (this.backendProcess) {
            this.backendProcess.kill();
            this.backendProcess = null;
        }
    }
}
