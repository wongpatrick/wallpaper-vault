/**
 * @file
 * Backend Status Guard component.
 * Restricts app access while the backend service is starting, crashed, or experiencing port collisions, providing recovery modals.
 */

import React, { useState, useEffect } from 'react';
import { 
    Container, 
    Stack, 
    Text, 
    Title, 
    Button, 
    Group, 
    Collapse, 
    Paper, 
    ThemeIcon, 
    Loader, 
    NumberInput, 
    Modal,
    Box
} from '@mantine/core';
import { 
    IconAlertTriangle, 
    IconRefresh, 
    IconFileText, 
    IconFolder, 
    IconPlug, 
    IconSettings,
    IconChevronDown,
    IconChevronUp
} from '@tabler/icons-react';
import { AXIOS_INSTANCE } from '../../api/axios-instance';
import type { BackendStatusInfo } from '../../types/electron';

const DEFAULT_PORT = 8000;
const HEALTH_CHECK_INTERVAL_MS = 60000;
const HEALTH_CHECK_STARTUP_INTERVAL_MS = 5000;
const RETRY_TIMEOUT_MS = 5000;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

interface BackendStatusGuardProps {
    children: React.ReactNode;
}

export default function BackendStatusGuard({ children }: BackendStatusGuardProps) {
    const isElectron = typeof window !== 'undefined' && 'electron' in window;
    
    const [statusInfo, setStatusInfo] = useState<BackendStatusInfo>({
        status: isElectron ? 'starting' : 'running',
        autoRestartCount: 0,
        maxRestarts: 3,
        port: DEFAULT_PORT
    });
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [portModalOpen, setPortModalOpen] = useState(false);
    const [customPort, setCustomPort] = useState<number>(DEFAULT_PORT);
    const [isRetrying, setIsRetrying] = useState(false);
    const [isSavingPort, setIsSavingPort] = useState(false);

    // Sync Axios base URL when status info port updates
    useEffect(() => {
        if (statusInfo.port) {
            AXIOS_INSTANCE.defaults.baseURL = `http://localhost:${statusInfo.port}`;
            setCustomPort(statusInfo.port);
        }
    }, [statusInfo.port]);

    useEffect(() => {
        if (!isElectron) {
            let timeoutId: NodeJS.Timeout;

            // Web fallback check
            const checkBrowserHealth = async () => {
                let isHealthy = false;
                try {
                    const res = await fetch(`http://localhost:${DEFAULT_PORT}/`);
                    if (res.ok) {
                        setStatusInfo({
                            status: 'running',
                            autoRestartCount: 0,
                            maxRestarts: 0,
                            port: DEFAULT_PORT
                        });
                        isHealthy = true;
                    } else {
                        throw new Error('Non-200 response');
                    }
                } catch {
                    setStatusInfo({
                        status: 'stopped',
                        autoRestartCount: 0,
                        maxRestarts: 0,
                        port: DEFAULT_PORT,
                        errorDetails: `FastAPI server not responding. Please run "uvicorn app.main:app --port ${DEFAULT_PORT}" in the backend directory.`
                    });
                }

                const delay = isHealthy ? HEALTH_CHECK_INTERVAL_MS : HEALTH_CHECK_STARTUP_INTERVAL_MS;
                timeoutId = setTimeout(checkBrowserHealth, delay);
            };

            checkBrowserHealth();
            return () => clearTimeout(timeoutId);
        }

        // Electron setup
        const initStatus = async () => {
            try {
                const status = await window.electron.getBackendStatus();
                setStatusInfo(status);
            } catch (err) {
                console.error('Failed to get initial backend status:', err);
            }
        };

        initStatus();

        // Listen for updates from Main process
        const unsubscribe = window.electron.on('backend-status-change', (data) => {
            const status = data as BackendStatusInfo;
            setStatusInfo(status);
            if (isRetrying && status.status === 'running') {
                setIsRetrying(false);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [isElectron, isRetrying]);

    const handleRetry = async () => {
        if (!isElectron) {
            window.location.reload();
            return;
        }
        setIsRetrying(true);
        try {
            await window.electron.restartBackend();
            // Timeout safety to disable spinner if nothing changes
            setTimeout(() => setIsRetrying(false), RETRY_TIMEOUT_MS);
        } catch (err) {
            console.error('Retry failed:', err);
            setIsRetrying(false);
        }
    };

    const handleSavePort = async () => {
        if (!customPort || customPort < MIN_PORT || customPort > MAX_PORT) return;
        setIsSavingPort(true);
        try {
            await window.electron.setBackendPort(customPort);
            AXIOS_INSTANCE.defaults.baseURL = `http://localhost:${customPort}`;
            
            // Trigger restart immediately
            await window.electron.restartBackend();
            setPortModalOpen(false);
        } catch (err) {
            console.error('Failed to save port:', err);
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

    // Render normal application when backend is successfully connected
    if (statusInfo.status === 'running') {
        return <>{children}</>;
    }

    // Diagnostic visual helpers
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
                            <Stack w="100%" gap="sm" mt="md">
                                <Button 
                                    onClick={handleRetry} 
                                    loading={isRetrying}
                                    leftSection={<IconRefresh size={18} />}
                                    color={config.color}
                                    radius="md"
                                    size="md"
                                >
                                    Retry Connection
                                </Button>

                                <Group justify="center" gap="xs">
                                    <Button 
                                        variant="subtle" 
                                        color="gray" 
                                        size="xs" 
                                        leftSection={<IconFileText size={14} />}
                                        onClick={handleOpenLogs}
                                    >
                                        View Logs
                                    </Button>
                                    <Button 
                                        variant="subtle" 
                                        color="gray" 
                                        size="xs" 
                                        leftSection={<IconFolder size={14} />}
                                        onClick={handleOpenLogsDir}
                                    >
                                        Open Logs Folder
                                    </Button>
                                    {isElectron && (
                                        <Button 
                                            variant="subtle" 
                                            color="gray" 
                                            size="xs" 
                                            leftSection={<IconSettings size={14} />}
                                            onClick={() => setPortModalOpen(true)}
                                        >
                                            Change Port
                                        </Button>
                                    )}
                                </Group>

                                {/* Collapsible Diagnostics */}
                                <Box mt="md" ta="left">
                                    <Button
                                        variant="transparent"
                                        color="gray"
                                        size="xs"
                                        p={0}
                                        onClick={() => setShowDiagnostics(!showDiagnostics)}
                                        rightSection={showDiagnostics ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                                    >
                                        Diagnostic Information
                                    </Button>
                                    
                                    <Collapse in={showDiagnostics} mt="xs">
                                        <Paper 
                                            p="sm" 
                                            radius="sm" 
                                            style={{ 
                                                backgroundColor: 'rgba(0, 0, 0, 0.3)', 
                                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                                fontFamily: 'monospace'
                                            }}
                                        >
                                            <Stack gap="xs">
                                                <Text size="xs" c="dimmed">
                                                    <span style={{ color: '#8892b0' }}>Status:</span> {statusInfo.status}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    <span style={{ color: '#8892b0' }}>Running Port:</span> {statusInfo.port}
                                                </Text>
                                                {isElectron && (
                                                    <Text size="xs" c="dimmed">
                                                        <span style={{ color: '#8892b0' }}>Auto-Restart Count:</span> {statusInfo.autoRestartCount} / {statusInfo.maxRestarts}
                                                    </Text>
                                                )}
                                                {statusInfo.errorDetails && (
                                                    <Text size="xs" c="red.4" style={{ whiteSpace: 'pre-wrap' }}>
                                                        <span style={{ color: '#8892b0' }}>Details:</span> {statusInfo.errorDetails}
                                                    </Text>
                                                )}
                                            </Stack>
                                        </Paper>
                                    </Collapse>
                                </Box>
                            </Stack>
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
            <Modal
                opened={portModalOpen}
                onClose={() => setPortModalOpen(false)}
                title="Configure Backend Port"
                centered
                radius="md"
                styles={{
                    content: {
                        backgroundColor: '#171a20',
                        color: '#eceff4',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                    },
                    header: {
                        backgroundColor: '#171a20',
                        color: '#eceff4',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                    }
                }}
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        If port 8000 is occupied, you can choose another port (e.g. 8080 or 9000). The application will update its settings and restart the backend on the new port.
                    </Text>
                    
                    <NumberInput
                        label="Custom Port"
                        description="Enter a port number between 1024 and 65535"
                        placeholder="8000"
                        min={MIN_PORT}
                        max={MAX_PORT}
                        value={customPort}
                        onChange={(val) => setCustomPort(Number(val))}
                        required
                        radius="md"
                    />

                    <Group justify="flex-end" mt="md">
                        <Button 
                            variant="subtle" 
                            color="gray" 
                            onClick={() => setPortModalOpen(false)}
                            radius="md"
                        >
                            Cancel
                        </Button>
                        <Button 
                            color="blue" 
                            onClick={handleSavePort}
                            loading={isSavingPort}
                            radius="md"
                        >
                            Update & Retry
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Box>
    );
}
