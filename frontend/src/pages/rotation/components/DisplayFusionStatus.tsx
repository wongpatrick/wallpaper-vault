/**
 * @file DisplayFusion integration status and configuration component.
 * Displays detection state (detected & running, installed but not running, not found),
 * resolved executable path, and allows re-checking or browsing for a custom executable.
 */
import { useState, useEffect, useCallback } from 'react';
import { Group, Badge, Text, Button, Stack, Code, Tooltip } from '@mantine/core';
import {
    IconCheck,
    IconAlertTriangle,
    IconAlertCircle,
    IconRefresh,
    IconFolderOpen,
    IconX
} from '@tabler/icons-react';
import type { DisplayFusionStatus as DFStatus } from '../../../types/electron';

export function DisplayFusionStatus() {
    const isWindowsElectron = Boolean(
        typeof window !== 'undefined' &&
        window.electron &&
        window.electron.platform === 'win32' &&
        window.electron.getDisplayFusionStatus
    );

    const [status, setStatus] = useState<DFStatus | null>(null);
    const [loading, setLoading] = useState(false);

    const checkStatus = useCallback(async () => {
        if (!isWindowsElectron || !window.electron?.getDisplayFusionStatus) return;
        setLoading(true);
        try {
            const res = await window.electron.getDisplayFusionStatus();
            setStatus(res);
        } catch (err) {
            console.error('Failed to get DisplayFusion status:', err);
        } finally {
            setLoading(false);
        }
    }, [isWindowsElectron]);

    useEffect(() => {
        if (isWindowsElectron) {
            void checkStatus();
        }
    }, [isWindowsElectron, checkStatus]);

    if (!isWindowsElectron) {
        return null;
    }

    const handleBrowse = async () => {
        if (!window.electron?.openFile || !window.electron?.setDisplayFusionPath) return;
        const filePath = await window.electron.openFile({
            title: 'Locate DisplayFusionCommand.exe',
            filters: [{ name: 'DisplayFusion CLI', extensions: ['exe'] }]
        });
        if (filePath) {
            setLoading(true);
            try {
                const updated = await window.electron.setDisplayFusionPath(filePath);
                setStatus(updated);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleClearCustom = async () => {
        if (!window.electron?.setDisplayFusionPath) return;
        setLoading(true);
        try {
            const updated = await window.electron.setDisplayFusionPath('');
            setStatus(updated);
        } finally {
            setLoading(false);
        }
    };

    let badgeColor = 'gray';
    let badgeText = 'Checking...';
    let badgeIcon = null;

    if (status) {
        if (status.installed && status.running) {
            badgeColor = 'green';
            badgeText = 'Detected & running';
            badgeIcon = <IconCheck size="0.8rem" />;
        } else if (status.installed && !status.running) {
            badgeColor = 'yellow';
            badgeText = 'Installed but not running';
            badgeIcon = <IconAlertTriangle size="0.8rem" />;
        } else {
            badgeColor = 'red';
            badgeText = 'Not found';
            badgeIcon = <IconAlertCircle size="0.8rem" />;
        }
    }

    return (
        <Stack gap="xs" mt="xs">
            <Group justify="space-between" wrap="wrap">
                <Group gap="xs">
                    <Text size="xs" fw={600}>Status:</Text>
                    <Badge color={badgeColor} variant="light" size="sm" leftSection={badgeIcon}>
                        {badgeText}
                    </Badge>
                    {status?.source && (
                        <Badge color="gray" variant="outline" size="xs">
                            Source: {status.source}
                        </Badge>
                    )}
                </Group>
                <Group gap="xs">
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={<IconRefresh size="0.75rem" />}
                        onClick={checkStatus}
                        loading={loading}
                    >
                        Re-check
                    </Button>
                    <Button
                        size="compact-xs"
                        variant="light"
                        leftSection={<IconFolderOpen size="0.75rem" />}
                        onClick={handleBrowse}
                        loading={loading}
                    >
                        Browse Exe...
                    </Button>
                    {status?.source === 'custom' && (
                        <Tooltip label="Clear custom path and revert to registry / default search">
                            <Button
                                size="compact-xs"
                                color="red"
                                variant="subtle"
                                leftSection={<IconX size="0.75rem" />}
                                onClick={handleClearCustom}
                                loading={loading}
                            >
                                Clear
                            </Button>
                        </Tooltip>
                    )}
                </Group>
            </Group>

            {status?.exePath ? (
                <Text size="xs" c="dimmed">
                    Executable: <Code style={{ fontSize: '11px' }}>{status.exePath}</Code>
                </Text>
            ) : status && !status.installed ? (
                <Text size="xs" c="dimmed">
                    Could not automatically locate <Code style={{ fontSize: '11px' }}>DisplayFusionCommand.exe</Code>. Click &quot;Browse Exe...&quot; to locate your DisplayFusion CLI tool.
                </Text>
            ) : null}
        </Stack>
    );
}
