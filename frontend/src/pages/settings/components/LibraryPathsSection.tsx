/**
 * @file
 * Module: LibraryPathsSection Component
 * Description: Management interface for multiple library storage roots, allowing adding, editing, setting default, scanning, and removing paths.
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
    TextInput,
    Checkbox,
    Tooltip,
    Alert,
    Loader
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
    IconFolderPlus,
    IconTrash,
    IconStar,
    IconStarFilled,
    IconRefresh,
    IconEdit,
    IconCheck,
    IconAlertCircle,
    IconFolder
} from '@tabler/icons-react';
import {
    useListLibraryPathsApiLibraryPathsGet,
    useCreateLibraryPathApiLibraryPathsPost,
    useUpdateLibraryPathApiLibraryPathsPathIdPut,
    useDeleteLibraryPathApiLibraryPathsPathIdDelete,
    useScanLibraryPathApiLibraryPathsPathIdScanPost,
    getListLibraryPathsApiLibraryPathsGetQueryKey
} from '../../../api/generated/library-paths/library-paths';
import { useQueryClient } from '@tanstack/react-query';
import { PathInput } from '../../../components/ui/PathInput';
import type { LibraryPath } from '../../../api/model';

export function LibraryPathsSection() {
    const queryClient = useQueryClient();
    const { data: pathsData, isLoading } = useListLibraryPathsApiLibraryPathsGet();

    const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
    const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
    const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);

    const [newPath, setNewPath] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newScanExisting, setNewScanExisting] = useState(true);
    const [newIsDefault, setNewIsDefault] = useState(false);

    const [selectedPath, setSelectedPath] = useState<LibraryPath | null>(null);
    const [editLabel, setEditLabel] = useState('');

    const createMutation = useCreateLibraryPathApiLibraryPathsPost();
    const updateMutation = useUpdateLibraryPathApiLibraryPathsPathIdPut();
    const deleteMutation = useDeleteLibraryPathApiLibraryPathsPathIdDelete();
    const scanMutation = useScanLibraryPathApiLibraryPathsPathIdScanPost();

    const handleCreate = async () => {
        if (!newPath.trim()) {
            notifications.show({
                title: 'Path Required',
                message: 'Please specify a valid folder path.',
                color: 'red'
            });
            return;
        }

        try {
            await createMutation.mutateAsync({
                data: {
                    path: newPath.trim(),
                    label: newLabel.trim() || undefined,
                    is_default: newIsDefault,
                    scan_existing: newScanExisting
                }
            });

            notifications.show({
                title: 'Library Path Added',
                message: newScanExisting
                    ? 'Path added successfully. Background scan initiated.'
                    : 'Path added successfully.',
                color: 'teal',
                icon: <IconCheck size={16} />
            });

            setNewPath('');
            setNewLabel('');
            setNewScanExisting(true);
            setNewIsDefault(false);
            closeAddModal();
            queryClient.invalidateQueries({ queryKey: getListLibraryPathsApiLibraryPathsGetQueryKey() });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to add library path';
            notifications.show({
                title: 'Error',
                message,
                color: 'red'
            });
        }
    };

    const handleSetDefault = async (path: LibraryPath) => {
        try {
            await updateMutation.mutateAsync({
                pathId: path.id,
                data: { is_default: true }
            });
            notifications.show({
                title: 'Default Path Updated',
                message: `"${path.label || path.path}" is now the default library path.`,
                color: 'teal',
                icon: <IconCheck size={16} />
            });
            queryClient.invalidateQueries({ queryKey: getListLibraryPathsApiLibraryPathsGetQueryKey() });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to update default path';
            notifications.show({
                title: 'Error',
                message,
                color: 'red'
            });
        }
    };

    const handleEditSave = async () => {
        if (!selectedPath) return;

        try {
            await updateMutation.mutateAsync({
                pathId: selectedPath.id,
                data: { label: editLabel.trim() || undefined }
            });
            notifications.show({
                title: 'Label Updated',
                message: 'Library path label was updated.',
                color: 'teal',
                icon: <IconCheck size={16} />
            });
            closeEditModal();
            queryClient.invalidateQueries({ queryKey: getListLibraryPathsApiLibraryPathsGetQueryKey() });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to update label';
            notifications.show({
                title: 'Error',
                message,
                color: 'red'
            });
        }
    };

    const handleDelete = async () => {
        if (!selectedPath) return;

        try {
            await deleteMutation.mutateAsync({
                pathId: selectedPath.id
            });
            notifications.show({
                title: 'Library Path Removed',
                message: 'The path was removed and associated sets have been unlinked.',
                color: 'teal',
                icon: <IconCheck size={16} />
            });
            closeDeleteModal();
            queryClient.invalidateQueries({ queryKey: getListLibraryPathsApiLibraryPathsGetQueryKey() });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to delete library path';
            notifications.show({
                title: 'Error',
                message,
                color: 'red'
            });
        }
    };

    const handleScan = async (path: LibraryPath) => {
        try {
            await scanMutation.mutateAsync({
                pathId: path.id
            });
            notifications.show({
                title: 'Scan Started',
                message: `Scanning folders in "${path.label || path.path}"...`,
                color: 'blue'
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to trigger scan';
            notifications.show({
                title: 'Error',
                message,
                color: 'red'
            });
        }
    };

    const paths = pathsData?.items || [];

    return (
        <Paper withBorder p="lg" radius="md">
            <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                    <div>
                        <Title order={3}>🗄️ Storage & Library Paths</Title>
                        <Text c="dimmed" size="sm">
                            Manage the storage locations where your wallpaper sets are organized. Sets from all paths appear together seamlessly.
                        </Text>
                    </div>
                    <Button
                        leftSection={<IconFolderPlus size={16} />}
                        onClick={openAddModal}
                        variant="filled"
                        color="blue"
                    >
                        Add Storage Path
                    </Button>
                </Group>

                {isLoading ? (
                    <Group justify="center" py="xl">
                        <Loader size="md" />
                    </Group>
                ) : paths.length === 0 ? (
                    <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="No Library Paths Configured">
                        You have not configured any storage paths yet. Click "Add Storage Path" to designate a directory for your wallpapers.
                    </Alert>
                ) : (
                    <Table verticalSpacing="sm" highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Name / Label</Table.Th>
                                <Table.Th>Filesystem Path</Table.Th>
                                <Table.Th>Sets</Table.Th>
                                <Table.Th>Status</Table.Th>
                                <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {paths.map((p) => (
                                <Table.Tr key={p.id}>
                                    <Table.Td style={{ fontWeight: 500 }}>
                                        <Group gap="xs">
                                            <IconFolder size={18} color="#228be6" />
                                            <span>{p.label || 'Default Library'}</span>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed" style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>
                                            {p.path}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Badge variant="light" color="gray">
                                            {p.set_count} {p.set_count === 1 ? 'set' : 'sets'}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        {p.is_default ? (
                                            <Badge color="teal" variant="filled">Default Import Target</Badge>
                                        ) : (
                                            <Badge color="gray" variant="outline">Secondary</Badge>
                                        )}
                                    </Table.Td>
                                    <Table.Td style={{ textAlign: 'right' }}>
                                        <Group gap="xs" justify="flex-end">
                                            {!p.is_default && (
                                                <Tooltip label="Set as Default Import Target">
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="yellow"
                                                        onClick={() => handleSetDefault(p)}
                                                    >
                                                        <IconStar size={18} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                            {p.is_default && (
                                                <Tooltip label="Default Import Target">
                                                    <ActionIcon variant="transparent" color="yellow">
                                                        <IconStarFilled size={18} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                            <Tooltip label="Scan for new/untracked sets">
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="blue"
                                                    onClick={() => handleScan(p)}
                                                    loading={scanMutation.isPending}
                                                >
                                                    <IconRefresh size={18} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Edit Label">
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="gray"
                                                    onClick={() => {
                                                        setSelectedPath(p);
                                                        setEditLabel(p.label || '');
                                                        openEditModal();
                                                    }}
                                                >
                                                    <IconEdit size={18} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Remove Path">
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="red"
                                                    onClick={() => {
                                                        setSelectedPath(p);
                                                        openDeleteModal();
                                                    }}
                                                >
                                                    <IconTrash size={18} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                )}
            </Stack>

            {/* Add Library Path Modal */}
            <Modal
                opened={addModalOpened}
                onClose={closeAddModal}
                title="Add Storage & Library Path"
                size="lg"
            >
                <Stack gap="md">
                    <PathInput
                        label="Directory Path"
                        description="Select an existing folder on your computer or local network drive."
                        placeholder="C:/Wallpapers or \\NAS\Wallpapers"
                        value={newPath}
                        onChange={setNewPath}
                        required
                    />

                    <TextInput
                        label="Friendly Label (Optional)"
                        description="A recognizable name (e.g. 'Local SSD', 'Main NAS', 'Secondary Drive')."
                        placeholder="Local SSD"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.currentTarget.value)}
                    />

                    <Checkbox
                        label="Auto-scan and register existing folders as wallpaper sets"
                        description="Non-destructively imports images and catalogs folders following the [Creator] - [Title] convention."
                        checked={newScanExisting}
                        onChange={(e) => setNewScanExisting(e.currentTarget.checked)}
                    />

                    <Checkbox
                        label="Make this the default target for new imports"
                        checked={newIsDefault}
                        onChange={(e) => setNewIsDefault(e.currentTarget.checked)}
                    />

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={closeAddModal}>
                            Cancel
                        </Button>
                        <Button
                            color="blue"
                            onClick={handleCreate}
                            loading={createMutation.isPending}
                        >
                            Add Path
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Edit Label Modal */}
            <Modal
                opened={editModalOpened}
                onClose={closeEditModal}
                title="Edit Storage Path Label"
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        Path: <Text span fw={500}>{selectedPath?.path}</Text>
                    </Text>

                    <TextInput
                        label="Friendly Label"
                        placeholder="e.g., Local SSD, Backup Drive"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.currentTarget.value)}
                    />

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={closeEditModal}>
                            Cancel
                        </Button>
                        <Button
                            color="blue"
                            onClick={handleEditSave}
                            loading={updateMutation.isPending}
                        >
                            Save Changes
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                opened={deleteModalOpened}
                onClose={closeDeleteModal}
                title="Remove Storage Path"
            >
                <Stack gap="md">
                    <Text size="sm">
                        Are you sure you want to remove the storage path <Text span fw={600}>"{selectedPath?.label || selectedPath?.path}"</Text>?
                    </Text>
                    <Alert icon={<IconAlertCircle size={16} />} color="blue">
                        Removing this path unlinks its associated sets from this location in the database. <strong>No image files or folders on disk will be deleted.</strong>
                    </Alert>

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={closeDeleteModal}>
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            onClick={handleDelete}
                            loading={deleteMutation.isPending}
                        >
                            Remove Path
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Paper>
    );
}
