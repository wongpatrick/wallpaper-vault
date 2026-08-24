/**
 * @file
 * Header Vault Switcher component.
 * Displays active vault status pill and dropdown menu for switching between backends.
 */
/* eslint-disable no-magic-numbers */
import { useState } from 'react';
import {
    Menu,
    UnstyledButton,
    Group,
    Text,
    Badge,
    Box
} from '@mantine/core';
import {
    IconServer,
    IconChevronDown,
    IconCheck,
    IconPlus,
    IconSettings
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useVault } from '../../hooks/useVault';
import { AddVaultModal } from '../vault/AddVaultModal';

export function VaultSwitcher() {
    const { vaults, activeVault, switchVault } = useVault();
    const navigate = useNavigate();
    const [addModalOpen, setAddModalOpen] = useState(false);

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'online':
                return '#40c057';
            case 'unauthorized':
                return '#fa5252';
            case 'offline':
            default:
                return '#868e96';
        }
    };

    const getStatusTooltip = (status?: string) => {
        switch (status) {
            case 'online':
                return 'Online';
            case 'unauthorized':
                return 'Unauthorized / Key Error';
            case 'offline':
            default:
                return 'Offline';
        }
    };

    return (
        <>
            <Menu position="bottom-start" shadow="md" width={260} radius="md" withinPortal={false}>
                <Menu.Target>
                    <UnstyledButton
                        style={{
                            padding: '4px 10px',
                            borderRadius: '20px',
                            backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))',
                            border: '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Group gap={6} wrap="nowrap">
                            <Box
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    backgroundColor: getStatusColor(activeVault.status),
                                    boxShadow: `0 0 6px ${getStatusColor(activeVault.status)}`
                                }}
                            />
                            <IconServer size={14} style={{ opacity: 0.75 }} />
                            <Text size="xs" fw={600} style={{ maxWidth: 140 }} truncate>
                                {activeVault.label}
                            </Text>
                            <IconChevronDown size={12} style={{ opacity: 0.5 }} />
                        </Group>
                    </UnstyledButton>
                </Menu.Target>

                <Menu.Dropdown>
                    <Menu.Label>Connected Vaults</Menu.Label>
                    {vaults.map((vault) => {
                        const isActive = vault.id === activeVault.id;
                        return (
                            <Menu.Item
                                key={vault.id}
                                onClick={() => switchVault(vault.id)}
                                leftSection={
                                    <Box
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            backgroundColor: getStatusColor(vault.status)
                                        }}
                                        title={getStatusTooltip(vault.status)}
                                    />
                                }
                                rightSection={
                                    <Group gap={4}>
                                        {vault.isLocal && (
                                            <Badge size="xs" variant="light" color="blue">
                                                Local
                                            </Badge>
                                        )}
                                        {isActive && <IconCheck size={14} color="var(--mantine-color-blue-5)" />}
                                    </Group>
                                }
                            >
                                <Text size="xs" fw={isActive ? 600 : 400} truncate>
                                    {vault.label}
                                </Text>
                            </Menu.Item>
                        );
                    })}

                    <Menu.Divider />

                    <Menu.Item
                        leftSection={<IconPlus size={14} />}
                        onClick={() => setAddModalOpen(true)}
                    >
                        <Text size="xs">Connect Remote Vault...</Text>
                    </Menu.Item>

                    <Menu.Item
                        leftSection={<IconSettings size={14} />}
                        onClick={() => navigate('/settings')}
                    >
                        <Text size="xs">Manage Vaults</Text>
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>

            <AddVaultModal
                opened={addModalOpen}
                onClose={() => setAddModalOpen(false)}
            />
        </>
    );
}
