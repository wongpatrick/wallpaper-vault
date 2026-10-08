/**
 * @file
 * Module: useBackendHealthWatchdog Hook
 * Description: Unified backend health checking hook supporting both Electron IPC subscriptions and browser HTTP polling loops.
 */
import { useState, useEffect, useCallback } from 'react';
import { AXIOS_INSTANCE } from '../api/axios-instance';
import { useVault } from './useVault';
import type { BackendStatusInfo } from '../types/electron';

const DEFAULT_PORT = 8000;
const HEALTH_CHECK_INTERVAL_MS = 60000;
const HEALTH_CHECK_STARTUP_INTERVAL_MS = 5000;
const RETRY_TIMEOUT_MS = 5000;
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_UNAUTHORIZED = 401;

export function useBackendHealthWatchdog() {
    const isElectron = typeof window !== 'undefined' && 'electron' in window;
    const { activeVault, refreshHealth } = useVault();

    const [statusInfo, setStatusInfo] = useState<BackendStatusInfo>({
        status: isElectron ? 'starting' : 'running',
        autoRestartCount: 0,
        maxRestarts: 3,
        port: DEFAULT_PORT
    });
    const [isRetrying, setIsRetrying] = useState(false);
    const [isSavingPort, setIsSavingPort] = useState(false);

    // Sync Axios base URL when status info port/url updates
    useEffect(() => {
        const customUrl = localStorage.getItem('backend_url') || '';
        if (customUrl) {
            AXIOS_INSTANCE.defaults.baseURL = customUrl;
        } else if (statusInfo.port) {
            AXIOS_INSTANCE.defaults.baseURL = `http://localhost:${statusInfo.port}`;
        }
    }, [statusInfo.port]);

    useEffect(() => {
        if (!activeVault.isLocal) {
            return;
        }

        if (!isElectron) {
            let timeoutId: ReturnType<typeof setTimeout>;
            const customBackendUrl = localStorage.getItem('backend_url') || '';
            const targetUrl = customBackendUrl || `http://localhost:${DEFAULT_PORT}`;

            const checkBrowserHealth = async () => {
                let isHealthy = false;
                try {
                    const cleanUrl = targetUrl.replace(/\/+$/, '');
                    const res = await fetch(`${cleanUrl}/`);
                    if (res.status === HTTP_STATUS_OK || res.status === HTTP_STATUS_UNAUTHORIZED) {
                        setStatusInfo({
                            status: 'running',
                            autoRestartCount: 0,
                            maxRestarts: 3,
                            port: DEFAULT_PORT
                        });
                        isHealthy = true;
                    } else {
                        setStatusInfo(prev => ({
                            ...prev,
                            status: 'error',
                            errorDetails: `Unexpected status code: ${res.status}`
                        }));
                    }
                } catch {
                    setStatusInfo(prev => ({
                        ...prev,
                        status: 'error',
                        errorDetails: `Failed to connect to ${targetUrl}. Check that the backend server is running and accessible.`
                    }));
                } finally {
                    const interval = isHealthy ? HEALTH_CHECK_INTERVAL_MS : HEALTH_CHECK_STARTUP_INTERVAL_MS;
                    timeoutId = setTimeout(checkBrowserHealth, interval);
                }
            };

            checkBrowserHealth();
            return () => clearTimeout(timeoutId);
        }

        // Electron mode
        const fetchInitialStatus = async () => {
            try {
                const info = await window.electron.getBackendStatus();
                setStatusInfo(info);
            } catch (err) {
                console.error('Failed to get backend status:', err);
                setStatusInfo(prev => ({
                    ...prev,
                    status: 'error',
                    errorDetails: 'Unable to communicate with Electron main process.'
                }));
            }
        };

        fetchInitialStatus();
        const removeListener = window.electron.onBackendStatusChange((info) => {
            setStatusInfo(info);
        });

        return () => {
            removeListener();
        };
    }, [isElectron, activeVault.isLocal]);

    const handleRetry = useCallback(async () => {
        setIsRetrying(true);
        try {
            if (!activeVault.isLocal) {
                await refreshHealth();
            } else if (isElectron) {
                await window.electron.restartBackend();
                const info = await window.electron.getBackendStatus();
                setStatusInfo(info);
            } else {
                const customBackendUrl = localStorage.getItem('backend_url') || '';
                const targetUrl = customBackendUrl || `http://localhost:${DEFAULT_PORT}`;
                const cleanUrl = targetUrl.replace(/\/+$/, '');
                const res = await fetch(`${cleanUrl}/`);
                if (res.status === HTTP_STATUS_OK || res.status === HTTP_STATUS_UNAUTHORIZED) {
                    setStatusInfo({
                        status: 'running',
                        autoRestartCount: 0,
                        maxRestarts: 3,
                        port: DEFAULT_PORT
                    });
                }
            }
        } catch (err) {
            console.error('Retry failed:', err);
        } finally {
            setTimeout(() => setIsRetrying(false), RETRY_TIMEOUT_MS);
        }
    }, [activeVault.isLocal, isElectron, refreshHealth]);

    const handleSavePort = useCallback(async (newPort: number) => {
        setIsSavingPort(true);
        try {
            if (isElectron) {
                await window.electron.setBackendPort(newPort);
                const info = await window.electron.getBackendStatus();
                setStatusInfo(info);
            }
        } catch (err) {
            console.error('Failed to update port:', err);
        } finally {
            setIsSavingPort(false);
        }
    }, [isElectron]);

    const handleOpenLogs = useCallback(async () => {
        if (isElectron) {
            await window.electron.openBackendLogs();
        }
    }, [isElectron]);

    const handleOpenLogsDir = useCallback(async () => {
        if (isElectron) {
            await window.electron.openLogsDirectory();
        }
    }, [isElectron]);

    return {
        statusInfo,
        setStatusInfo,
        isElectron,
        isRetrying,
        isSavingPort,
        handleRetry,
        handleSavePort,
        handleOpenLogs,
        handleOpenLogsDir
    };
}
