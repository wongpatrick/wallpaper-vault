/**
 * @file
 * Module: Backend Crash / Diagnostics Panel
 * Description: Action buttons and collapsible technical diagnostics display when the backend service encounters errors.
 */
import { useState } from 'react';
import { Stack, Button, Group, Box, Collapse, Paper, Text } from '@mantine/core';
import {
    IconRefresh, IconFileText, IconFolder, IconSettings, IconChevronUp, IconChevronDown
} from '@tabler/icons-react';
import type { BackendStatusInfo } from '../../types/electron';

interface BackendCrashPanelProps {
    statusInfo: BackendStatusInfo;
    color: string;
    isRetrying: boolean;
    isElectron: boolean;
    onRetry: () => void;
    onOpenLogs: () => void;
    onOpenLogsDir: () => void;
    onOpenPortModal: () => void;
}

export function BackendCrashPanel({
    statusInfo,
    color,
    isRetrying,
    isElectron,
    onRetry,
    onOpenLogs,
    onOpenLogsDir,
    onOpenPortModal
}: BackendCrashPanelProps) {
    const [showDiagnostics, setShowDiagnostics] = useState(false);

    return (
        <Stack w="100%" gap="sm" mt="md">
            <Button 
                onClick={onRetry} 
                loading={isRetrying}
                leftSection={<IconRefresh size={18} />}
                color={color}
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
                    onClick={onOpenLogs}
                >
                    View Logs
                </Button>
                <Button 
                    variant="subtle" 
                    color="gray" 
                    size="xs" 
                    leftSection={<IconFolder size={14} />}
                    onClick={onOpenLogsDir}
                >
                    Open Logs Folder
                </Button>
                {isElectron && (
                    <Button 
                        variant="subtle" 
                        color="gray" 
                        size="xs" 
                        leftSection={<IconSettings size={14} />}
                        onClick={onOpenPortModal}
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
    );
}
