/**
 * @file
 * Banner component displayed in Aggregated Mode when one or more connected vaults are offline or unreachable.
 * Informs the user of partial dataset availability and lists affected backends.
 */
import { Alert, Text, Group, Badge, Button, Stack } from '@mantine/core';
import { IconAlertCircle, IconSettings } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import type { VaultEntry } from '../../types/electron';

interface AggregatedVaultBannerProps {
    isAggregated: boolean;
    onlineCount: number;
    totalVaultsCount: number;
    offlineVaults: VaultEntry[];
}

export function AggregatedVaultBanner({
    isAggregated,
    onlineCount,
    totalVaultsCount,
    offlineVaults
}: AggregatedVaultBannerProps) {
    const navigate = useNavigate();

    if (!isAggregated || offlineVaults.length === 0) {
        return null;
    }

    const offlineLabels = offlineVaults.map(v => v.label).join(', ');

    return (
        <Alert
            data-testid="aggregated-vault-banner"
            variant="light"
            color="yellow"
            title={`Aggregated View: ${onlineCount} of ${totalVaultsCount} Vaults Online`}
            icon={<IconAlertCircle size={18} />}
            radius="md"
            mb="md"
        >
            <Stack gap="xs">
                <Text size="sm">
                    Some vaults are currently offline or unreachable ({offlineLabels}). Results below only include data from reachable backends.
                </Text>
                <Group gap="xs">
                    {offlineVaults.map(v => (
                        <Badge key={v.id} size="xs" color="gray" variant="outline">
                            {v.label} ({v.status || 'offline'})
                        </Badge>
                    ))}
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        color="yellow"
                        leftSection={<IconSettings size={12} />}
                        onClick={() => navigate('/settings')}
                    >
                        Manage Vaults
                    </Button>
                </Group>
            </Stack>
        </Alert>
    );
}
