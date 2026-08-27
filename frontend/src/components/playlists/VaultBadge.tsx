/**
 * @file
 * Vault origin badge component.
 * Displays a small badge identifying which vault an image belongs to.
 */
import { Badge, Tooltip } from '@mantine/core';
import { useVault } from '../../hooks/useVault';

interface VaultBadgeProps {
    vaultId: string;
    label?: string;
    size?: 'xs' | 'sm' | 'md';
}

export function VaultBadge({ vaultId, label, size = 'xs' }: VaultBadgeProps) {
    const { vaults } = useVault();
    const vault = vaults.find((v) => v.vaultId === vaultId || v.id === vaultId);

    const displayLabel = label || vault?.label || vault?.vaultName || vaultId.slice(0, 8);
    const isOnline = vault ? (vault.isLocal || vault.status === 'online') : true;

    return (
        <Tooltip label={`Vault: ${displayLabel} (${isOnline ? 'Online' : 'Offline'})`} withArrow position="top">
            <Badge
                size={size}
                variant="filled"
                color={isOnline ? 'blue' : 'gray'}
                styles={{
                    root: {
                        textTransform: 'none',
                        cursor: 'default',
                        fontWeight: 600,
                    },
                }}
            >
                {displayLabel}
            </Badge>
        </Tooltip>
    );
}
