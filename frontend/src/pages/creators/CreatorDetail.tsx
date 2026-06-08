/**
 * @file
 * Module: Creator Detail Page
 * Description: Displays detailed information about a specific creator, including their wallpaper sets, statistics, and provides functionality to edit or delete their profile.
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useSelection } from '../../hooks/useSelection';
import { 
    Title, Text, Container, SimpleGrid, Group, Badge, Loader, 
    Center, Alert, Stack, ActionIcon, Menu, Button, Card, 
    TextInput, Select, Textarea, Modal, Paper
} from '@mantine/core';
import { 
    IconAlertCircle, IconArrowLeft, IconDotsVertical, IconTrash, 
    IconEdit, IconDatabase, IconPhoto, IconLayersIntersect, IconAspectRatio,
    IconCheck
} from '@tabler/icons-react';
import { 
    useReadCreatorApiCreatorsCreatorIdGet, 
    useUpdateCreatorApiCreatorsCreatorIdPatch,
    useDeleteCreatorApiCreatorsCreatorIdDelete,
    useMergeCreatorsApiCreatorsMergePost
} from '../../api/generated/creators/creators';
import { notifications } from '@mantine/notifications';
import { SetCard } from '../../components/sets/SetCard';
import { CreatorAvatar } from '../../components/creators/CreatorAvatar';
import { SetBulkOperations } from '../../components/sets/SetBulkOperations';
import { useState, useMemo } from 'react';
import { formatBytes } from '../../utils/fileUtils';
import type { Set as SetModel, CreatorWithSets } from '../../api/model';
import { CREATOR_TYPES } from '../../types/enums';

const HTTP_STATUS_CONFLICT = 409;

export default function CreatorDetail() {
    const { creatorId } = useParams<{ creatorId: string }>();
    const navigate = useNavigate();
    
    // We must pass enabled: true because the Orval generated hook defaults to enabled: !!creatorId, which disables the query for ID 0.
    const { data: creatorData, isLoading, error, refetch } = useReadCreatorApiCreatorsCreatorIdGet(
        Number(creatorId),
        { query: { enabled: true } }
    );
    const creator = creatorData as CreatorWithSets | undefined;
    
    const updateMutation = useUpdateCreatorApiCreatorsCreatorIdPatch();
    const deleteMutation = useDeleteCreatorApiCreatorsCreatorIdDelete();

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [editForm, setEditForm] = useState({
        canonical_name: '',
        type: '',
        notes: ''
    });

    const mergeMutation = useMergeCreatorsApiCreatorsMergePost();
    const [mergePrompt, setMergePrompt] = useState<{ show: boolean, targetId: number | null }>({ show: false, targetId: null });

    const { selectionMode, setSelectionMode, selectedIds, toggle: toggleSelect, clear: clearSelection, startSelectionWith } = useSelection();





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

    const confirmDelete = async () => {
        try {
            await deleteMutation.mutateAsync({ creatorId: Number(creatorId) });
            notifications.show({ title: 'Creator deleted', message: 'Artist removed from database', color: 'blue' });
            setIsDeleteModalOpen(false);
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

                    {creator.id !== 0 && (
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
                                    <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={() => setIsDeleteModalOpen(true)}>
                                        Delete Artist
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                    )}
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
                    {creator.sets.map((set: SetModel) => (
                        <SetCard 
                            key={set.id} 
                            set={set} 
                            onDelete={() => {}} 
                            selectionMode={selectionMode}
                            selected={selectedIds.has(set.id)}
                            onToggleSelect={() => toggleSelect(set.id)}
                            onLongPress={() => {
                                if (!selectionMode) {
                                    startSelectionWith(set.id);
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

            <SetBulkOperations 
                selectedIds={selectedIds}
                clearSelection={clearSelection}
                selectionMode={selectionMode}
                refetch={refetch}
                selectedSets={(creator.sets || []).filter(s => selectedIds.has(s.id))}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                opened={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title="Delete Artist"
                radius="md"
            >
                <Stack gap="md">
                    <Alert icon={<IconAlertCircle size="1rem" />} color="red" variant="light">
                        Are you sure you want to delete this artist?
                    </Alert>
                    <Text size="sm" c="dimmed">
                        This will NOT delete their wallpapers, but they will be marked as "Unknown Creator". This action cannot be undone.
                    </Text>
                    <Group grow>
                        <Button variant="default" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                        <Button color="red" onClick={confirmDelete} loading={deleteMutation.isPending}>Delete</Button>
                    </Group>
                </Stack>
            </Modal>
        </Container>
    );
}
