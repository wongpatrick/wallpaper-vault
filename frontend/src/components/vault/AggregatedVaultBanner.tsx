/**
 * @file
 * Banner component displayed in Aggregated Mode when one or more connected vaults are offline,
 * unreachable, or encounter partial query errors.
 * Informs the user of partial dataset availability and lists affected backends.
 */
import { useState } from 'react';
import { Alert, Badge, Button, Group, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconAlertTriangle, IconSettings } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import type { VaultEntry } from '../../types/electron';
import type { VaultError } from '../../hooks/multiVault';

interface AggregatedVaultBannerProps {
    isAggregated: boolean;
    onlineCount: number;
    totalVaultsCount: number;
    offlineVaults: VaultEntry[];
    partialErrors?: VaultError[];
}

export function AggregatedVaultBanner({
    isAggregated,
    onlineCount,
    totalVaultsCount,
    offlineVaults,
    partialErrors = []
}: AggregatedVaultBannerProps) {
    const navigate = useNavigate();
    const [dismissedErrors, setDismissedErrors] = useState<string[]>([]);

    if (!isAggregated) {
        return null;
    }

    const activeErrors = partialErrors.filter(e => !dismissedErrors.includes(e.vaultId));

    if (offlineVaults.length === 0 && activeErrors.length === 0) {
        return null;
    }

    const offlineLabels = offlineVaults.map(v => v.label).join(', ');

    return (
        <Stack gap="xs" mb="md">
            {activeErrors.length > 0 && (
                <Alert
                    data-testid="partial-vault-errors-banner"
                    variant="light"
                    color="orange"
                    title="Vault Query Warning"
                    icon={<IconAlertTriangle size={18} />}
                    withCloseButton
                    onClose={() => setDismissedErrors(prev => [...prev, ...activeErrors.map(e => e.vaultId)])}
                    radius="md"
                >
                    <Stack gap="xs">
                        <Text size="sm">
                            Failed to retrieve data from {activeErrors.map(e => e.vaultLabel).join(', ')}. Some results may be incomplete.
                        </Text>
                        <Group gap="xs">
                            {activeErrors.map(e => (
                                <Badge key={e.vaultId} size="xs" color="red" variant="outline">
                                    {e.vaultLabel}: {e.error.message || 'Request failed'}
                                </Badge>
                            ))}
                        </Group>
                    </Stack>
                </Alert>
            )}

            {offlineVaults.length > 0 && (
                <Alert
                    data-testid="aggregated-vault-banner"
                    variant="light"
                    color="yellow"
                    title={`Aggregated View: ${onlineCount} of ${totalVaultsCount} Vaults Online`}
                    icon={<IconAlertCircle size={18} />}
                    radius="md"
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
            )}
        </Stack>
    );
}
