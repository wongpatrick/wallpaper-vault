/**
 * @file
 * Backend Status Guard component.
 * Restricts app access while the active backend (local or remote) is starting, crashed, offline, or experiencing port collisions, providing recovery modals.
 */

import React, { useState, useEffect } from 'react';
import { 
    Container, 
    Stack, 
    Text, 
    Title, 
    Button, 
    Paper, 
    ThemeIcon, 
    Loader, 
    Box, 
    Select
} from '@mantine/core';
import { 
    IconAlertTriangle, 
    IconRefresh, 
    IconPlug, 
    IconServer, 
    IconLock
} from '@tabler/icons-react';
import { AXIOS_INSTANCE } from '../../api/axios-instance';
import { useVault } from '../../hooks/useVault';
import type { BackendStatusInfo } from '../../types/electron';
import { PortCollisionModal } from './PortCollisionModal';
import { BackendCrashPanel } from './BackendCrashModal';

const DEFAULT_PORT = 8000;
const HEALTH_CHECK_INTERVAL_MS = 60000;
const HEALTH_CHECK_STARTUP_INTERVAL_MS = 5000;
const RETRY_TIMEOUT_MS = 5000;
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_UNAUTHORIZED = 401;

interface BackendStatusGuardProps {
    children: React.ReactNode;
}

export default function BackendStatusGuard({ children }: BackendStatusGuardProps) {
    const isElectron = typeof window !== 'undefined' && 'electron' in window;
    const { activeVault, vaults, switchVault, refreshHealth } = useVault();
    
    const [statusInfo, setStatusInfo] = useState<BackendStatusInfo>({
        status: isElectron ? 'starting' : 'running',
        autoRestartCount: 0,
        maxRestarts: 3,
        port: DEFAULT_PORT
    });
    const [portModalOpen, setPortModalOpen] = useState(false);
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

    const handleRetry = async () => {
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
    };

    const handleSavePort = async (newPort: number) => {
        setIsSavingPort(true);
        try {
            if (isElectron) {
                await window.electron.setBackendPort(newPort);
                const info = await window.electron.getBackendStatus();
                setStatusInfo(info);
                setPortModalOpen(false);
            }
        } catch (err) {
            console.error('Failed to update port:', err);
        } finally {
            setIsSavingPort(false);
        }
    };

    const handleOpenLogs = async () => {
        if (isElectron) {
            await window.electron.openBackendLogs();
        }
    };

    const handleOpenLogsDir = async () => {
        if (isElectron) {
            await window.electron.openLogsDirectory();
        }
    };

    const handleSwitchToLocal = () => {
        const localVault = vaults.find(v => v.isLocal) || vaults[0];
        if (localVault) {
            switchVault(localVault.id);
        }
    };

    // Render normal application when backend is successfully connected
    if (activeVault.isLocal && statusInfo.status === 'running') {
        return <>{children}</>;
    }

    if (!activeVault.isLocal && activeVault.status === 'online') {
        return <>{children}</>;
    }

    // Remote vault offline/unauthorized guard screen
    if (!activeVault.isLocal) {
        const isUnauthorized = activeVault.status === 'unauthorized';
        return (
            <Box
                style={{
                    width: '100vw',
                    height: '100vh',
                    backgroundColor: '#0a0b0d',
                    color: '#eceff4',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                }}
            >
                <Container size="xs" w="100%">
                    <Paper
                        p="xl"
                        radius="lg"
                        style={{
                            background: 'rgba(23, 26, 32, 0.85)',
                            backdropFilter: 'blur(16px)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            boxShadow: `0 20px 40px rgba(0, 0, 0, 0.5), 0 0 50px ${isUnauthorized ? 'rgba(255, 193, 7, 0.15)' : 'rgba(244, 67, 54, 0.15)'}`,
                            transition: 'all 0.5s ease-in-out'
                        }}
                    >
                        <Stack align="center" gap="lg" ta="center">
                            <ThemeIcon color={isUnauthorized ? "yellow" : "red"} size={54} radius="xl" variant="light">
                                {isUnauthorized ? <IconLock size={32} /> : <IconAlertTriangle size={32} />}
                            </ThemeIcon>

                            <Stack gap="xs">
                                <Title order={2} style={{ letterSpacing: '-0.5px' }}>
                                    {isUnauthorized ? 'Authentication Failed' : 'Remote Vault Unreachable'}
                                </Title>
                                <Text size="sm" c="dimmed" px="md">
                                    {isUnauthorized
                                        ? `The configured API key for "${activeVault.label}" is invalid or missing. Please update the API key in Settings.`
                                        : `Unable to establish a connection to "${activeVault.label}" at ${activeVault.url}.`}
                                </Text>
                            </Stack>

                            <Stack w="100%" gap="sm" mt="md">
                                <Button
                                    onClick={handleSwitchToLocal}
                                    leftSection={<IconServer size={18} />}
                                    color="blue"
                                    radius="md"
                                    size="md"
                                >
                                    Switch to Local Vault
                                </Button>

                                <Button
                                    onClick={handleRetry}
                                    loading={isRetrying}
                                    leftSection={<IconRefresh size={18} />}
                                    variant="light"
                                    color="gray"
                                    radius="md"
                                    size="md"
                                >
                                    Retry Connection
                                </Button>

                                {vaults.length > 2 && (
                                    <Select
                                        placeholder="Switch to another vault..."
                                        data={vaults.filter(v => v.id !== activeVault.id).map(v => ({ value: v.id, label: v.label }))}
                                        onChange={(val) => { if (val) switchVault(val); }}
                                        radius="md"
                                        size="xs"
                                        mt="xs"
                                    />
                                )}
                            </Stack>
                        </Stack>
                    </Paper>
                </Container>
            </Box>
        );
    }

    // Diagnostic visual helpers for local backend
    const getStatusConfig = () => {
        switch (statusInfo.status) {
            case 'starting':
                return {
                    title: 'Connecting to Backend...',
                    description: `Initializing application services on port ${statusInfo.port}. This should take just a moment.`,
                    color: 'blue',
                    glowColor: 'rgba(33, 150, 243, 0.15)',
                    icon: <Loader size={48} color="blue" />
                };
            case 'port-collision':
                return {
                    title: 'Port Conflict Detected',
                    description: `Port ${statusInfo.port} is already in use by another application. Please free the port or configure a different one.`,
                    color: 'yellow',
                    glowColor: 'rgba(255, 193, 7, 0.15)',
                    icon: (
                        <ThemeIcon color="yellow" size={54} radius="xl" variant="light">
                            <IconPlug size={32} />
                        </ThemeIcon>
                    )
                };
            case 'error':
            default:
                return {
                    title: 'Backend Process Error',
                    description: 'The backend service encountered a critical error or crashed repeatedly on startup.',
                    color: 'red',
                    glowColor: 'rgba(244, 67, 54, 0.15)',
                    icon: (
                        <ThemeIcon color="red" size={54} radius="xl" variant="light">
                            <IconAlertTriangle size={32} />
                        </ThemeIcon>
                    )
                };
        }
    };

    const config = getStatusConfig();

    return (
        <Box
            style={{
                width: '100vw',
                height: '100vh',
                backgroundColor: '#0a0b0d',
                color: '#eceff4',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            }}
        >
            <Container size="xs" w="100%">
                <Paper
                    p="xl"
                    radius="lg"
                    style={{
                        background: 'rgba(23, 26, 32, 0.75)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: `0 20px 40px rgba(0, 0, 0, 0.5), 0 0 50px ${config.glowColor}`,
                        transition: 'all 0.5s ease-in-out'
                    }}
                >
                    <Stack align="center" gap="lg" ta="center">
                        {config.icon}
                        
                        <Stack gap="xs">
                            <Title order={2} style={{ letterSpacing: '-0.5px' }}>{config.title}</Title>
                            <Text size="sm" c="dimmed" px="md">
                                {statusInfo.errorDetails || config.description}
                            </Text>
                        </Stack>

                        {statusInfo.status !== 'starting' && (
                            <BackendCrashPanel
                                statusInfo={statusInfo}
                                color={config.color}
                                isRetrying={isRetrying}
                                isElectron={isElectron}
                                onRetry={handleRetry}
                                onOpenLogs={handleOpenLogs}
                                onOpenLogsDir={handleOpenLogsDir}
                                onOpenPortModal={() => setPortModalOpen(true)}
                            />
                        )}
                        
                        {statusInfo.status === 'starting' && (
                            <Text size="xs" c="dimmed" mt="xs">
                                Waiting for HTTP heartbeat response...
                            </Text>
                        )}
                    </Stack>
                </Paper>
            </Container>

            {/* Change Port Recovery Modal */}
            <PortCollisionModal
                opened={portModalOpen}
                onClose={() => setPortModalOpen(false)}
                initialPort={statusInfo.port}
                onSavePort={handleSavePort}
                isSaving={isSavingPort}
            />
        </Box>
    );
}
