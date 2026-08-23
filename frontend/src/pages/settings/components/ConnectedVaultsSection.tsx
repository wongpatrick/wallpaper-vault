/**
 * @file
 * ConnectedVaultsSection Component for Settings page.
 * Manages list of connected local and remote vaults, connection testing, switching, editing, and deletion.
 */
import { useState } from 'react';
import {
    Paper,
    Title,
    Text,
    Stack,
    Group,
    Button,
    Badge,
    ActionIcon,
    Table,
    Modal,
    Tooltip,
    Box
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
    IconPlus,
    IconTrash,
    IconRefresh,
    IconEdit,
    IconCheck,
    IconServer,
    IconPlug
} from '@tabler/icons-react';
import { useVault } from '../../../hooks/useVault';
import { AddVaultModal } from '../../../components/vault/AddVaultModal';
import type { VaultEntry } from '../../../types/electron';

export function ConnectedVaultsSection() {
    const { vaults, activeVault, switchVault, removeVault, testConnection, refreshHealth } = useVault();

    const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
    const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
    const [editingVault, setEditingVault] = useState<VaultEntry | null>(null);
    const [vaultToDelete, setVaultToDelete] = useState<VaultEntry | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);

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

    const getStatusLabel = (status?: string) => {
        switch (status) {
            case 'online':
                return 'Online';
            case 'unauthorized':
                return 'Unauthorized';
            case 'offline':
            default:
                return 'Offline';
        }
    };

    const handleTestSingle = async (vault: VaultEntry) => {
        setTestingId(vault.id);
        try {
            const res = await testConnection(vault.url, vault.apiKey);
            if (res.success) {
                notifications.show({
                    title: 'Connection Successful',
                    message: `Connected to ${res.vaultName || vault.label} (v${res.version || '0.1.0'})`,
                    color: 'teal',
                    icon: <IconCheck size={16} />
                });
            } else {
                notifications.show({
                    title: res.status === 'unauthorized' ? 'Authentication Failed' : 'Connection Failed',
                    message: res.error || 'Server did not respond',
                    color: res.status === 'unauthorized' ? 'yellow' : 'red'
                });
            }
            await refreshHealth();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Test failed';
            notifications.show({
                title: 'Test Failed',
                message: msg,
                color: 'red'
            });
        } finally {
            setTestingId(null);
        }
    };

    const confirmDelete = (vault: VaultEntry) => {
        setVaultToDelete(vault);
        openDeleteModal();
    };

    const handleDelete = async () => {
        if (!vaultToDelete) return;
        try {
            await removeVault(vaultToDelete.id);
            notifications.show({
                title: 'Vault Removed',
                message: `Removed connection to "${vaultToDelete.label}".`,
                color: 'gray'
            });
            closeDeleteModal();
            setVaultToDelete(null);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to remove vault';
            notifications.show({
                title: 'Error',
                message: msg,
                color: 'red'
            });
        }
    };

    return (
        <Paper p="xl" radius="md" withBorder>
            <Stack gap="lg">
                <Group justify="space-between" align="flex-start">
                    <Stack gap={4}>
                        <Group gap="xs">
                            <IconServer size={22} color="var(--mantine-color-blue-6)" />
                            <Title order={3}>Connected Vaults</Title>
                        </Group>
                        <Text size="sm" c="dimmed">
                            Manage connections to your local and remote Wallpaper Vault instances.
                        </Text>
                    </Stack>

                    <Group gap="xs">
                        <Button
                            variant="light"
                            color="gray"
                            size="sm"
                            leftSection={<IconRefresh size={16} />}
                            onClick={() => refreshHealth()}
                        >
                            Refresh Status
                        </Button>
                        <Button
                            leftSection={<IconPlus size={16} />}
                            size="sm"
                            onClick={() => {
                                setEditingVault(null);
                                openAddModal();
                            }}
                        >
                            Connect Remote Vault
                        </Button>
                    </Group>
                </Group>

                <Table.ScrollContainer minWidth={650}>
                    <Table verticalSpacing="sm" highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Status</Table.Th>
                                <Table.Th>Label</Table.Th>
                                <Table.Th>Server URL</Table.Th>
                                <Table.Th>Last Seen</Table.Th>
                                <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {vaults.map((vault) => {
                                const isActive = vault.id === activeVault.id;
                                const isTesting = testingId === vault.id;
                                return (
                                    <Table.Tr key={vault.id} style={isActive ? { backgroundColor: 'light-dark(rgba(33, 150, 243, 0.05), rgba(33, 150, 243, 0.1))' } : undefined}>
                                        <Table.Td>
                                            <Group gap={6} wrap="nowrap">
                                                <Box
                                                    style={{
                                                        width: 9,
                                                        height: 9,
                                                        borderRadius: '50%',
                                                        backgroundColor: getStatusColor(vault.status),
                                                        boxShadow: `0 0 6px ${getStatusColor(vault.status)}`
                                                    }}
                                                />
                                                <Text size="xs" c="dimmed">
                                                    {getStatusLabel(vault.status)}
                                                </Text>
                                            </Group>
                                        </Table.Td>

                                        <Table.Td>
                                            <Group gap="xs" wrap="nowrap">
                                                <Text fw={600} size="sm">
                                                    {vault.label}
                                                </Text>
                                                {vault.isLocal && (
                                                    <Badge size="xs" variant="light" color="blue">
                                                        Local Built-in
                                                    </Badge>
                                                )}
                                                {isActive && (
                                                    <Badge size="xs" variant="filled" color="green">
                                                        Active Context
                                                    </Badge>
                                                )}
                                            </Group>
                                        </Table.Td>

                                        <Table.Td>
                                            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                                                {vault.url}
                                            </Text>
                                        </Table.Td>

                                        <Table.Td>
                                            <Text size="xs" c="dimmed">
                                                {vault.lastSeen ? new Date(vault.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                                            </Text>
                                        </Table.Td>

                                        <Table.Td>
                                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                                                {!isActive ? (
                                                    <Button
                                                        size="xs"
                                                        variant="light"
                                                        color="blue"
                                                        onClick={() => switchVault(vault.id)}
                                                    >
                                                        Switch
                                                    </Button>
                                                ) : (
                                                    <Badge size="sm" variant="outline" color="blue">
                                                        Selected
                                                    </Badge>
                                                )}

                                                <Tooltip label="Test Connection">
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="gray"
                                                        size="sm"
                                                        loading={isTesting}
                                                        onClick={() => handleTestSingle(vault)}
                                                    >
                                                        <IconPlug size={16} />
                                                    </ActionIcon>
                                                </Tooltip>

                                                <Tooltip label="Edit Vault">
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="gray"
                                                        size="sm"
                                                        onClick={() => {
                                                            setEditingVault(vault);
                                                            openAddModal();
                                                        }}
                                                    >
                                                        <IconEdit size={16} />
                                                    </ActionIcon>
                                                </Tooltip>

                                                {!vault.isLocal ? (
                                                    <Tooltip label="Remove Vault">
                                                        <ActionIcon
                                                            variant="subtle"
                                                            color="red"
                                                            size="sm"
                                                            onClick={() => confirmDelete(vault)}
                                                        >
                                                            <IconTrash size={16} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip label="Local vault cannot be removed">
                                                        <ActionIcon
                                                            variant="subtle"
                                                            color="gray"
                                                            size="sm"
                                                            disabled
                                                        >
                                                            <IconTrash size={16} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                )}
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Stack>

            {/* Add / Edit Modal */}
            <AddVaultModal
                opened={addModalOpened}
                onClose={() => {
                    closeAddModal();
                    setEditingVault(null);
                }}
                editingVault={editingVault}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                opened={deleteModalOpened}
                onClose={closeDeleteModal}
                title={<Text fw={600}>Remove Remote Vault</Text>}
                centered
                radius="md"
            >
                <Stack gap="md">
                    <Text size="sm">
                        Are you sure you want to remove the connection to <strong>{vaultToDelete?.label}</strong> ({vaultToDelete?.url})?
                    </Text>
                    <Text size="xs" c="dimmed">
                        This only disconnects the vault from your client app. No library files, tags, or database records on the remote server will be deleted.
                    </Text>
                    <Group justify="flex-end" mt="md">
                        <Button variant="subtle" color="gray" onClick={closeDeleteModal}>
                            Cancel
                        </Button>
                        <Button color="red" onClick={handleDelete}>
                            Remove Vault
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Paper>
    );
}
