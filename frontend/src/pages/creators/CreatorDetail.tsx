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
    TextInput, Select, Textarea, Modal, Paper, SegmentedControl,
    Input
} from '@mantine/core';
import { 
    IconAlertCircle, IconArrowLeft, IconDotsVertical, IconTrash, 
    IconEdit, IconDatabase, IconPhoto, IconLayersIntersect, IconAspectRatio,
    IconCheck, IconSearch
} from '@tabler/icons-react';
import { 
    useReadCreatorApiCreatorsCreatorIdGet, 
    useUpdateCreatorApiCreatorsCreatorIdPatch,
    useDeleteCreatorApiCreatorsCreatorIdDelete,
    useMergeCreatorsApiCreatorsMergePost,
    getReadCreatorsApiCreatorsGetQueryKey,
    getReadCreatorApiCreatorsCreatorIdGetQueryKey
} from '../../api/generated/creators/creators';
import { useDeleteSetApiSetsSetIdDelete, getReadSetsApiSetsGetQueryKey } from '../../api/generated/sets/sets';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { SetCard } from '../../components/sets/SetCard';
import { CreatorAvatar } from '../../components/creators/CreatorAvatar';
import { SetBulkOperations } from '../../components/sets/SetBulkOperations';
import { useState, useMemo } from 'react';
import { formatBytes } from '../../utils/fileUtils';
import type { Set as SetModel, CreatorWithSets } from '../../api/model';
import { CREATOR_TYPES } from '../../types/enums';

const HTTP_STATUS_CONFLICT = 409;
const SQUARE_RATIO_TOLERANCE = 0.05;

export default function CreatorDetail() {
    const { creatorId } = useParams<{ creatorId: string }>();
    const navigate = useNavigate();
    
    const queryClient = useQueryClient();
    
    // We must pass enabled: !isNaN(Number(creatorId)) because the Orval generated hook defaults to enabled: !!creatorId, which disables the query for ID 0.
    const { data: creatorData, isLoading, error, refetch } = useReadCreatorApiCreatorsCreatorIdGet(
        Number(creatorId),
        { query: { enabled: !isNaN(Number(creatorId)) } }
    );
    const creator = creatorData as CreatorWithSets | undefined;
    
    const updateMutation = useUpdateCreatorApiCreatorsCreatorIdPatch();
    const deleteMutation = useDeleteCreatorApiCreatorsCreatorIdDelete();
    const deleteSetMutation = useDeleteSetApiSetsSetIdDelete();

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [editForm, setEditForm] = useState({
        canonical_name: '',
        type: '',
        notes: ''
    });

    const isEditFormDirty = useMemo(() => {
        if (!creator) return false;
        return (
            editForm.canonical_name !== (creator.canonical_name || '') ||
            editForm.type !== (creator.type || 'Artist') ||
            editForm.notes !== (creator.notes || '')
        );
    }, [editForm, creator]);

    const resetEditForm = () => {
        if (creator) {
            setEditForm({
                canonical_name: creator.canonical_name,
                type: creator.type || 'Artist',
                notes: creator.notes || ''
            });
        }
    };

    const mergeMutation = useMergeCreatorsApiCreatorsMergePost();
    const [mergePrompt, setMergePrompt] = useState<{ show: boolean, targetId: number | null }>({ show: false, targetId: null });

    const { selectionMode, setSelectionMode, selectedIds, toggle: toggleSelect, clear: clearSelection, startSelectionWith } = useSelection();

    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<string>('date_added_desc');
    const [orientationFilter, setOrientationFilter] = useState<string>('all');

    const processedSets = useMemo(() => {
        if (!creator || !creator.sets) return [];
        
        let result = [...creator.sets];
        
        // 1. Filter by Search Query
        if (searchQuery.trim()) {
            const query = searchQuery.trim().toLowerCase();
            result = result.filter(set => {
                const titleMatch = set.title ? set.title.toLowerCase().includes(query) : false;
                const tagMatch = set.tags ? set.tags.some(tag => tag.toLowerCase().includes(query)) : false;
                const charMatch = set.characters ? set.characters.some(char => char.toLowerCase().includes(query)) : false;
                return titleMatch || tagMatch || charMatch;
            });
        }
        
        // 2. Filter by Orientation
        if (orientationFilter !== 'all') {
            result = result.filter(set => {
                if (!set.images || set.images.length === 0) return false;
                return set.images.some(img => {
                    const ratio = img.aspect_ratio;
                    if (!ratio) return false;
                    if (orientationFilter === 'landscape') return ratio > 1.0;
                    if (orientationFilter === 'portrait') return ratio < 1.0;
                    if (orientationFilter === 'square') return Math.abs(ratio - 1.0) < SQUARE_RATIO_TOLERANCE;
                    return false;
                });
            });
        }
        
        // 3. Sort
        result.sort((a, b) => {
            switch (sortBy) {
                case 'title_asc':
                    return (a.title || '').localeCompare(b.title || '');
                case 'title_desc':
                    return (b.title || '').localeCompare(a.title || '');
                case 'date_added_desc':
                    return b.date_added.localeCompare(a.date_added);
                case 'date_added_asc':
                    return a.date_added.localeCompare(b.date_added);
                case 'image_count_desc':
                    return (b.images?.length || 0) - (a.images?.length || 0);
                case 'image_count_asc':
                    return (a.images?.length || 0) - (b.images?.length || 0);
                case 'folder_size_desc': {
                    const sizeA = a.images?.reduce((sum, img) => sum + (img.file_size || 0), 0) || 0;
                    const sizeB = b.images?.reduce((sum, img) => sum + (img.file_size || 0), 0) || 0;
                    return sizeB - sizeA;
                }
                case 'folder_size_asc': {
                    const sizeA = a.images?.reduce((sum, img) => sum + (img.file_size || 0), 0) || 0;
                    const sizeB = b.images?.reduce((sum, img) => sum + (img.file_size || 0), 0) || 0;
                    return sizeA - sizeB;
                }
                default:
                    return 0;
            }
        });
        
        return result;
    }, [creator, searchQuery, orientationFilter, sortBy]);







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
            <Container fluid px="xl">
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
            queryClient.invalidateQueries({ queryKey: getReadCreatorsApiCreatorsGetQueryKey() });
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
            queryClient.invalidateQueries({ queryKey: getReadCreatorsApiCreatorsGetQueryKey() });
            queryClient.invalidateQueries({ queryKey: getReadCreatorApiCreatorsCreatorIdGetQueryKey(mergePrompt.targetId) });
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
            queryClient.invalidateQueries({ queryKey: getReadCreatorsApiCreatorsGetQueryKey() });
            navigate('/creators');
        } catch {
            notifications.show({ title: 'Error', message: 'Could not delete creator', color: 'red' });
        }
    };

    const handleDeleteSet = (setId: number) => {
        const targetSet = creator?.sets?.find(s => s.id === setId);
        modals.openConfirmModal({
            title: 'Delete Set',
            centered: true,
            children: (
                <Text size="sm">
                    Are you sure you want to delete the set <b>"{targetSet?.title || `Set #${setId}`}"</b> ({targetSet?.images?.length || 0} images)? This will permanently remove all images in this set from your computer. This action cannot be undone.
                </Text>
            ),
            labels: { confirm: 'Delete permanently', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    await deleteSetMutation.mutateAsync({ setId });
                    notifications.show({
                        title: 'Set deleted',
                        message: 'The set has been removed from your library.',
                        color: 'blue',
                    });
                    queryClient.invalidateQueries({ queryKey: getReadSetsApiSetsGetQueryKey() });
                    refetch();
                } catch (err) {
                    const axiosError = err as { response?: { data?: { detail?: string } } };
                    const message = axiosError.response?.data?.detail || 'Could not delete the set.';
                    notifications.show({
                        title: 'Error',
                        message: typeof message === 'string' ? message : 'Could not delete the set.',
                        color: 'red',
                        autoClose: 10000
                    });
                }
            },
        });
    };

    return (
        <Container fluid px="xl" pb={selectionMode ? 100 : "xl"}>
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
                            <Button 
                                leftSection={<IconEdit size={18} />} 
                                variant="light" 
                                onClick={() => {
                                    setEditForm({
                                        canonical_name: creator.canonical_name,
                                        type: creator.type || 'Artist',
                                        notes: creator.notes || ''
                                    });
                                    setIsEditModalOpen(true);
                                }}
                            >
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
                <>
                    <Group mb="xl" wrap="wrap" gap="md" align="flex-end">
                        <TextInput
                            label="Search"
                            placeholder="Search titles, tags, or characters..."
                            leftSection={<IconSearch size={16} />}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.currentTarget.value)}
                            style={{ flex: 1, minWidth: 220, maxWidth: 400 }}
                        />
                        <Input.Wrapper label="Orientation">
                            <SegmentedControl
                                value={orientationFilter}
                                onChange={setOrientationFilter}
                                data={[
                                    { label: 'All', value: 'all' },
                                    { label: 'Landscape', value: 'landscape' },
                                    { label: 'Portrait', value: 'portrait' },
                                    { label: 'Square', value: 'square' },
                                ]}
                            />
                        </Input.Wrapper>
                        <Select
                            label="Sort By"
                            w={200}
                            value={sortBy}
                            onChange={(val) => setSortBy(val || 'date_added_desc')}
                            data={[
                                { label: 'Date Added (Newest)', value: 'date_added_desc' },
                                { label: 'Date Added (Oldest)', value: 'date_added_asc' },
                                { label: 'Title (A-Z)', value: 'title_asc' },
                                { label: 'Title (Z-A)', value: 'title_desc' },
                                { label: 'Image Count (High-Low)', value: 'image_count_desc' },
                                { label: 'Image Count (Low-High)', value: 'image_count_asc' },
                                { label: 'Folder Size (Largest)', value: 'folder_size_desc' },
                                { label: 'Folder Size (Smallest)', value: 'folder_size_asc' },
                            ]}
                        />
                    </Group>

                    {processedSets.length > 0 ? (
                        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
                            {processedSets.map((set: SetModel) => (
                                <SetCard 
                                    key={set.id} 
                                    set={set} 
                                    onDelete={handleDeleteSet} 
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
                        <Stack align="center" py={100} gap="md">
                            <Text size="xl" fw={500} c="dimmed">No sets match your filters</Text>
                            <Text c="dimmed">Try adjusting your search terms or clearing the orientation filter.</Text>
                        </Stack>
                    )}
                </>
            ) : (
                <Center py={100}>
                    <Text c="dimmed">This artist has no wallpaper sets yet.</Text>
                </Center>
            )}

            {/* Edit Modal */}
            <Modal 
                opened={isEditModalOpen} 
                onClose={() => {
                    if (isEditFormDirty) {
                        modals.openConfirmModal({
                            title: 'Unsaved Changes',
                            centered: true,
                            children: (
                                <Text size="sm">
                                    You have unsaved changes. Do you want to discard them?
                                </Text>
                            ),
                            labels: { confirm: 'Discard Changes', cancel: 'Keep Editing' },
                            confirmProps: { color: 'red' },
                            onConfirm: () => {
                                setIsEditModalOpen(false);
                                resetEditForm();
                            }
                        });
                    } else {
                        setIsEditModalOpen(false);
                    }
                }} 
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
