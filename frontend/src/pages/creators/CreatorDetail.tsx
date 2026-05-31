/**
 * @file
 * Module: Creator Detail Page
 * Description: Displays detailed information about a specific creator, including their wallpaper sets, statistics, and provides functionality to edit or delete their profile.
 */
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Title, Text, Container, SimpleGrid, Group, Badge, Loader, 
    Center, Alert, Stack, ActionIcon, Menu, Button, Card, 
    TextInput, Select, Textarea, Modal, Paper, Transition
} from '@mantine/core';
import { 
    IconAlertCircle, IconArrowLeft, IconDotsVertical, IconTrash, 
    IconEdit, IconDatabase, IconPhoto, IconLayersIntersect, IconAspectRatio,
    IconCheck, IconX, IconTag, IconUserEdit, IconGitMerge
} from '@tabler/icons-react';
import { 
    useReadCreatorApiCreatorsCreatorIdGet, 
    useUpdateCreatorApiCreatorsCreatorIdPatch,
    useDeleteCreatorApiCreatorsCreatorIdDelete,
    useMergeCreatorsApiCreatorsMergePost
} from '../../api/generated/creators/creators';
import { useBulkUpdateSetsApiSetsBulkUpdatePost, useBulkDeleteSetsApiSetsBulkDeletePost, useMergeSetsApiSetsMergePost } from '../../api/generated/sets/sets';
import { notifications } from '@mantine/notifications';
import { SetCard } from '../../components/sets/SetCard';
import { CreatorAvatar } from '../../components/creators/CreatorAvatar';
import { SetBulkEditModal } from '../../components/sets/SetBulkEditModal';
import { MergeSetsModal } from '../../components/sets/MergeSetsModal';
import { useState, useMemo } from 'react';
import { formatBytes } from '../../utils/fileUtils';
import type { Set, CreatorWithSets, SetUpdate, BulkOperationMode } from '../../api/model';
import { CREATOR_TYPES } from '../../types/enums';

const HTTP_STATUS_CONFLICT = 409;

export default function CreatorDetail() {
    const { creatorId } = useParams<{ creatorId: string }>();
    const navigate = useNavigate();
    
    // 1. All hooks at the top
    const { data: creatorData, isLoading, error, refetch } = useReadCreatorApiCreatorsCreatorIdGet(Number(creatorId));
    const creator = creatorData as CreatorWithSets | undefined;
    
    const updateMutation = useUpdateCreatorApiCreatorsCreatorIdPatch();
    const deleteMutation = useDeleteCreatorApiCreatorsCreatorIdDelete();

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editForm, setEditForm] = useState({
        canonical_name: '',
        type: '',
        notes: ''
    });

    const mergeMutation = useMergeCreatorsApiCreatorsMergePost();
    const [mergePrompt, setMergePrompt] = useState<{ show: boolean, targetId: number | null }>({ show: false, targetId: null });

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<globalThis.Set<number>>(new globalThis.Set());
    const [modalType, setModalType] = useState<'artist' | 'tags' | 'delete' | null>(null);
    const [isMergeSetsModalOpen, setIsMergeSetsModalOpen] = useState(false);

    const bulkUpdateSetsMutation = useBulkUpdateSetsApiSetsBulkUpdatePost();
    const bulkDeleteSetsMutation = useBulkDeleteSetsApiSetsBulkDeletePost();
    const mergeSetsMutation = useMergeSetsApiSetsMergePost();

    const toggleSelect = (id: number) => {
        const next = new globalThis.Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
        if (next.size > 0) setSelectionMode(true);
    };

    const clearSelection = () => {
        setSelectedIds(new globalThis.Set());
        setSelectionMode(false);
    };

    const handleBulkConfirm = async (data: SetUpdate, mode: BulkOperationMode) => {
        const ids = Array.from(selectedIds);
        try {
            if (modalType === 'delete') {
                await bulkDeleteSetsMutation.mutateAsync({ data: ids });
                notifications.show({ title: 'Success', message: `Successfully deleted ${ids.length} sets.`, color: 'blue' });
            } else {
                await bulkUpdateSetsMutation.mutateAsync({
                    data: { set_ids: ids, update_data: data, operation_mode: mode }
                });
                notifications.show({ title: 'Success', message: `Successfully updated ${ids.length} sets.`, color: 'blue' });
            }
            setModalType(null);
            clearSelection();
            refetch();
        } catch (err) {
            console.error(err);
            notifications.show({ title: 'Error', message: 'Bulk operation failed.', color: 'red' });
        }
    };

    const handleMergeSetsConfirm = async (targetId: number) => {
        const sourceIds = Array.from(selectedIds).filter(id => id !== targetId);
        try {
            await mergeSetsMutation.mutateAsync({
                data: { source_ids: sourceIds, target_id: targetId }
            });
            notifications.show({ title: 'Merge Success', message: `Successfully merged ${sourceIds.length + 1} sets into one.`, color: 'green' });
            setIsMergeSetsModalOpen(false);
            clearSelection();
            refetch();
        } catch (err) {
            console.error(err);
            notifications.show({ title: 'Merge Error', message: 'Failed to merge sets.', color: 'red' });
        }
    };

    const [prevCreatorId, setPrevCreatorId] = useState<number | null>(null);
    if (creator && creator.id !== prevCreatorId) {
        setPrevCreatorId(creator.id);
        setEditForm(prev => {
            if (prev.canonical_name === creator.canonical_name && 
                prev.type === (creator.type || 'Artist') && 
                prev.notes === (creator.notes || '')) {
                return prev;
            }
            return {
                canonical_name: creator.canonical_name,
                type: creator.type || 'Artist',
                notes: creator.notes || ''
            };
        });
    }

    const stats = useMemo(() => {
        if (!creator) return [];
        return [
            { label: 'Total Sets', value: creator.stats?.total_sets || 0, icon: IconLayersIntersect, color: 'blue' },
            { label: 'Total Images', value: creator.stats?.total_images || 0, icon: IconPhoto, color: 'teal' },
            { label: 'Library Size', value: formatBytes(creator.stats?.total_size_bytes || 0), icon: IconDatabase, color: 'orange' },
            { label: 'Primary Ratio', value: creator.stats?.primary_aspect_ratio || 'N/A', icon: IconAspectRatio, color: 'grape' },
        ];
    }, [creator]);

    // 2. Early returns
    if (isLoading) return <Center h={400}><Loader size="xl" /></Center>;

    if (error || !creator) {
        return (
            <Container size="xl">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red">
                    Could not fetch creator details.
                </Alert>
                <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/creators')} mt="md">
                    Back to Creators
                </Button>
            </Container>
        );
    }

    // 3. Handlers
    const handleUpdate = async () => {
        try {
            await updateMutation.mutateAsync({ 
                creatorId: Number(creatorId), 
                data: editForm 
            });
            notifications.show({ title: 'Success', message: 'Creator updated', color: 'green' });
            setIsEditModalOpen(false);
            refetch();
        } catch (error: unknown) {
            const err = error as { response?: { status?: number, data?: { detail?: Record<string, unknown> | string } } };
            const detail = err.response?.data?.detail;
            
            if (err.response?.status === HTTP_STATUS_CONFLICT && detail && typeof detail === 'object' && 'conflicting_id' in detail) {
                setMergePrompt({ show: true, targetId: detail.conflicting_id as number });
                setIsEditModalOpen(false);
                return;
            }

            const message = typeof detail === 'string' ? detail : ((detail?.message as string) || 'Could not update creator');
            notifications.show({ title: 'Error', message, color: 'red' });
        }
    };

    const handleMergeConfirm = async () => {
        if (!mergePrompt.targetId) return;
        try {
            await mergeMutation.mutateAsync({
                data: {
                    source_ids: [Number(creatorId)],
                    target_id: mergePrompt.targetId
                }
            });
            notifications.show({ title: 'Success', message: 'Artists merged successfully', color: 'green' });
            setMergePrompt({ show: false, targetId: null });
            navigate(`/creators/${mergePrompt.targetId}`);
        } catch {
            notifications.show({ title: 'Error', message: 'Could not merge artists', color: 'red' });
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure? This will NOT delete their wallpapers, but they will be marked as "Unknown Creator".')) return;
        try {
            await deleteMutation.mutateAsync({ creatorId: Number(creatorId) });
            notifications.show({ title: 'Creator deleted', message: 'Artist removed from database', color: 'blue' });
            navigate('/creators');
        } catch {
            notifications.show({ title: 'Error', message: 'Could not delete creator', color: 'red' });
        }
    };

    return (
        <Container size="xl" pb={selectionMode ? 100 : "xl"}>
            <Button 
                variant="subtle" 
                leftSection={<IconArrowLeft size={16} />} 
                onClick={() => navigate(-1)} 
                mb="lg"
                color="gray"
            >
                Back to Artists
            </Button>

            {/* Profile Header */}
            <Card withBorder radius="md" p="xl" mb="xl">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Group align="center" gap="xl">
                        <CreatorAvatar imageId={creator.stats?.preview_image_id} size={100} />
                        <Stack gap={4}>
                            <Title order={1}>{creator.canonical_name}</Title>
                            <Group gap="xs">
                                <Badge size="lg" variant="light" color="blue">{creator.type || 'Artist'}</Badge>
                            </Group>
                        </Stack>
                    </Group>

                    <Group>
                        <Button leftSection={<IconEdit size={18} />} variant="light" onClick={() => setIsEditModalOpen(true)}>
                            Edit Profile
                        </Button>
                        <Menu shadow="md" width={200} position="bottom-end">
                            <Menu.Target>
                                <ActionIcon variant="outline" size="lg" radius="md">
                                    <IconDotsVertical size={18} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Label>Management</Menu.Label>
                                <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={handleDelete}>
                                    Delete Artist
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Group>

                {creator.notes && (
                    <Text mt="xl" size="lg" c="dimmed" fs="italic">
                        "{creator.notes}"
                    </Text>
                )}
            </Card>

            {/* Stats Grid */}
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} mb={40}>
                {stats.map((stat) => (
                    <Paper key={stat.label} withBorder p="md" radius="md">
                        <Group justify="space-between">
                            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                                {stat.label}
                            </Text>
                            <stat.icon size={20} color={`var(--mantine-color-${stat.color}-6)`} />
                        </Group>
                        <Group align="flex-end" gap="xs" mt={10}>
                            <Text size="xl" fw={700}>
                                {stat.value}
                            </Text>
                        </Group>
                    </Paper>
                ))}
            </SimpleGrid>

            {/* Artist's Sets */}
            <Group justify="space-between" align="center" mb="lg">
                <Title order={2}>Collection by {creator.canonical_name}</Title>
                <Button 
                    variant={selectionMode ? "filled" : "light"} 
                    color={selectionMode ? "blue" : "gray"}
                    leftSection={selectionMode ? <IconCheck size={16} /> : null}
                    onClick={() => selectionMode ? clearSelection() : setSelectionMode(true)}
                >
                    {selectionMode ? "Finish Selecting" : "Select Items"}
                </Button>
            </Group>
            
            {creator.sets && creator.sets.length > 0 ? (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
                    {creator.sets.map((set: Set) => (
                        <SetCard 
                            key={set.id} 
                            set={set} 
                            onDelete={() => {}} 
                            selectionMode={selectionMode}
                            selected={selectedIds.has(set.id)}
                            onToggleSelect={() => toggleSelect(set.id)}
                            onLongPress={() => {
                                if (!selectionMode) {
                                    setSelectionMode(true);
                                    setSelectedIds(new globalThis.Set([set.id]));
                                }
                            }}
                        />
                    ))}
                </SimpleGrid>
            ) : (
                <Center py={100}>
                    <Text c="dimmed">This artist has no wallpaper sets yet.</Text>
                </Center>
            )}

            {/* Edit Modal */}
            <Modal 
                opened={isEditModalOpen} 
                onClose={() => setIsEditModalOpen(false)} 
                title="Edit Creator Profile"
                radius="md"
            >
                <Stack gap="md">
                    <TextInput 
                        label="Artist Name" 
                        value={editForm.canonical_name} 
                        onChange={(e) => setEditForm({ ...editForm, canonical_name: e.currentTarget.value })}
                    />
                    <Select 
                        label="Creator Type"
                        data={CREATOR_TYPES as unknown as string[]}
                        value={editForm.type}
                        onChange={(v) => setEditForm({ ...editForm, type: v || '' })}
                    />
                    <Textarea 
                        label="Internal Notes"
                        placeholder="Add links or artist info..."
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.currentTarget.value })}
                        minRows={3}
                    />
                    <Button fullWidth onClick={handleUpdate} mt="md">Save Changes</Button>
                </Stack>
            </Modal>

            {/* Merge Confirmation Modal */}
            <Modal
                opened={mergePrompt.show}
                onClose={() => setMergePrompt({ show: false, targetId: null })}
                title="Artist Already Exists"
                radius="md"
            >
                <Stack gap="md">
                    <Alert icon={<IconAlertCircle size="1rem" />} color="yellow">
                        An artist with the name "{editForm.canonical_name}" already exists. Do you want to merge this artist into the existing one?
                    </Alert>
                    <Text size="sm" c="dimmed">
                        This will transfer all wallpaper sets to the existing artist and delete this profile.
                    </Text>
                    <Group grow>
                        <Button variant="default" onClick={() => setMergePrompt({ show: false, targetId: null })}>Cancel</Button>
                        <Button color="yellow" onClick={handleMergeConfirm}>Merge Artists</Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Floating Bulk Action Bar */}
            <Transition mounted={selectionMode && selectedIds.size > 0} transition="slide-up" duration={400} timingFunction="ease">
                {(styles) => (
                    <Paper 
                        shadow="xl" 
                        p="md" 
                        withBorder 
                        style={{ 
                            ...styles,
                            position: 'fixed', 
                            bottom: 20, 
                            left: '50%', 
                            transform: 'translateX(-50%)',
                            zIndex: 100,
                            borderRadius: 100,
                            backgroundColor: 'var(--mantine-color-body)',
                            width: 'auto',
                            minWidth: 400
                        }}
                    >
                        <Group justify="space-between" wrap="nowrap">
                            <Group gap="sm">
                                <ActionIcon variant="subtle" color="gray" onClick={clearSelection} radius="xl">
                                    <IconX size={18} />
                                </ActionIcon>
                                <Text fw={600} size="sm">
                                    {selectedIds.size} items selected
                                </Text>
                            </Group>

                            <Group gap="xs">
                                {selectedIds.size >= 2 && (
                                    <Button 
                                        size="xs" 
                                        variant="light" 
                                        color="green"
                                        leftSection={<IconGitMerge size={14} />} 
                                        radius="xl"
                                        onClick={() => setIsMergeSetsModalOpen(true)}
                                    >
                                        Merge
                                    </Button>
                                )}
                                <Button size="xs" variant="light" leftSection={<IconUserEdit size={14} />} radius="xl" onClick={() => setModalType('artist')}>
                                    Artist
                                </Button>
                                <Button size="xs" variant="light" leftSection={<IconTag size={14} />} radius="xl" onClick={() => setModalType('tags')}>
                                    Tags
                                </Button>
                                <Button size="xs" variant="light" color="red" leftSection={<IconTrash size={14} />} radius="xl" onClick={() => setModalType('delete')}>
                                    Delete
                                </Button>
                            </Group>
                        </Group>
                    </Paper>
                )}
            </Transition>

            {/* Bulk Edit Modal */}
            <SetBulkEditModal 
                key={modalType || 'none'}
                opened={modalType !== null}
                onClose={() => setModalType(null)}
                type={modalType || 'artist'}
                selectedCount={selectedIds.size}
                onConfirm={handleBulkConfirm}
                loading={bulkUpdateSetsMutation.isPending || bulkDeleteSetsMutation.isPending}
            />

            {/* Merge Sets Modal */}
            <MergeSetsModal 
                opened={isMergeSetsModalOpen}
                onClose={() => setIsMergeSetsModalOpen(false)}
                selectedSets={(creator.sets || []).filter(s => selectedIds.has(s.id))}
                onConfirm={handleMergeSetsConfirm}
                loading={mergeSetsMutation.isPending}
            />
        </Container>
    );
}
