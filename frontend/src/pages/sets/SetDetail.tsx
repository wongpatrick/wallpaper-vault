/**
 * Module: Set Detail Page
 * Description: Displays detailed information and a gallery view for a specific wallpaper set, supporting selection, bulk editing, and syncing.
 */
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Title, Text, Container, Group, Badge, Loader, 
    Center, Alert, Stack, ActionIcon, Menu, Button, Modal,
    TextInput, Textarea, MultiSelect, TagsInput, Box, Switch, Transition, Paper
} from '@mantine/core';
import { 
    IconAlertCircle, IconArrowLeft, IconDotsVertical, IconTrash, 
    IconExternalLink, IconFolder, IconEdit, IconTag, IconLock, IconLockOpen, IconRefresh, IconCheck, IconX,
    IconSettings, IconPhotoEdit
} from '@tabler/icons-react';
import { 
    useReadSetApiSetsSetIdGet, 
    useDeleteSetApiSetsSetIdDelete,
    useUpdateSetApiSetsSetIdPatch,
    useResyncSetApiSetsSetIdResyncPost
} from '../../api/generated/sets/sets';
import { useBulkUpdateImagesApiImagesBulkUpdatePost } from '../../api/generated/images/images';
import { useReadCreatorsApiCreatorsGet } from '../../api/generated/creators/creators';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { ImageGridItem } from './components/ImageGridItem';
import { Lightbox } from './components/Lightbox';
import { ImageEditModal } from './components/ImageEditModal';
import { ImageBulkEditModal } from './components/ImageBulkEditModal';
import type { Image as ImageModel, BulkOperationMode } from '../../api/model';

export default function SetDetail() {
    const { setId } = useParams<{ setId: string }>();
    const navigate = useNavigate();
    
    // 1. All hooks at the top
    const { data: set, isLoading, error, refetch } = useReadSetApiSetsSetIdGet(Number(setId));
    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 });
    const deleteMutation = useDeleteSetApiSetsSetIdDelete();
    const updateMutation = useUpdateSetApiSetsSetIdPatch();
    const resyncMutation = useResyncSetApiSetsSetIdResyncPost();
    const bulkUpdateMutation = useBulkUpdateImagesApiImagesBulkUpdatePost();

    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [enablePathEdit, setEnablePathEdit] = useState(false);
    const [editingImage, setEditingImage] = useState<ImageModel | null>(null);

    // Selection State
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(new Set());
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    
    const [editForm, setEditForm] = useState({
        title: '',
        notes: '',
        source_url: '',
        local_path: '',
        creator_ids: [] as string[],
        tags: [] as string[]
    });

    useEffect(() => {
        if (set) {
            setEditForm({
                title: set.title || '',
                notes: set.notes || '',
                source_url: set.source_url || '',
                local_path: set.local_path || '',
                creator_ids: set.creators?.map(c => String(c.id)) || [],
                tags: set.tags ? set.tags.split(',').filter(t => t.trim()) : []
            });
        }
    }, [set]);

    const creatorOptions = useMemo(() => 
        creatorsData?.items?.map(c => ({ value: String(c.id), label: c.canonical_name })) || [], 
    [creatorsData]);

    // 2. Early returns
    if (isLoading) {
        return <Center h={400}><Loader size="xl" /></Center>;
    }

    if (error || !set) {
        return (
            <Container size="xl">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red">
                    Could not fetch the set details.
                </Alert>
                <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/sets')} mt="md">
                    Back to Sets
                </Button>
            </Container>
        );
    }

    // 3. Handlers
    const handleUpdate = async () => {
        try {
            await updateMutation.mutateAsync({
                setId: Number(setId),
                data: {
                    ...editForm,
                    creator_ids: editForm.creator_ids.map(Number),
                    tags: editForm.tags.join(',')
                }
            });
            notifications.show({ title: 'Success', message: 'Set metadata updated', color: 'green' });
            setIsEditModalOpen(false);
            refetch();
        } catch {
            notifications.show({ title: 'Error', message: 'Could not update set', color: 'red' });
        }
    };

    const handleDelete = () => {
        modals.openConfirmModal({
            title: 'Delete Set',
            centered: true,
            children: (
                <Text size="sm">
                    Are you sure you want to delete this set? This will permanently remove all images in this set from your computer. This action cannot be undone.
                </Text>
            ),
            labels: { confirm: 'Delete permanently', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    await deleteMutation.mutateAsync({ setId: Number(setId) });
                    notifications.show({ title: 'Set deleted', message: 'Set removed from vault', color: 'blue' });
                    navigate('/sets');
                } catch {
                    notifications.show({ title: 'Error', message: 'Could not delete set', color: 'red' });
                }
            },
        });
    };

    const handleOpenFolder = async () => {
        if (!set?.local_path) {
            notifications.show({ title: 'Error', message: 'No local path recorded.', color: 'red' });
            return;
        }
        try {
            const result = await window.electron.openPath(set.local_path);
            if (result && result.error) {
                notifications.show({ title: 'Folder not found', message: result.error, color: 'red' });
            }
        } catch {
            notifications.show({ title: 'Native Error', message: 'Could not open folder.', color: 'red' });
        }
    };

    const handleResync = async () => {
        try {
            await resyncMutation.mutateAsync({ setId: Number(setId) });
            notifications.show({
                title: 'Resync Complete',
                message: 'Successfully synced database with folder contents.',
                color: 'green',
            });
            refetch();
        } catch (err) {
            console.error('Resync failed:', err);
            notifications.show({
                title: 'Resync Failed',
                message: 'Could not sync folder. Ensure the path is correct and accessible.',
                color: 'red',
            });
        }
    };

    const toggleImageSelect = (id: number) => {
        const next = new Set(selectedImageIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedImageIds(next);
        if (next.size > 0) setSelectionMode(true);
    };

    const handleSelectAll = () => {
        if (!set?.images) return;
        const allIds = new Set(set.images.map(img => img.id));
        setSelectedImageIds(allIds);
        setSelectionMode(true);
    };

    const clearSelection = () => {
        setSelectedImageIds(new Set());
        setSelectionMode(false);
    };

    const handleBulkEditConfirm = async (data: Partial<{ rating: string; tags: string; notes: string }>, mode: BulkOperationMode) => {
        try {
            await bulkUpdateMutation.mutateAsync({
                data: {
                    image_ids: Array.from(selectedImageIds),
                    update_data: data,
                    operation_mode: mode
                }
            });
            notifications.show({
                title: 'Success',
                message: `Successfully updated ${selectedImageIds.size} images.`,
                color: 'green',
            });
            setIsBulkEditOpen(false);
            clearSelection();
            refetch();
        } catch (err) {
            console.error('Bulk update failed:', err);
            notifications.show({
                title: 'Error',
                message: 'Failed to update images in bulk.',
                color: 'red',
            });
        }
    };

    const creatorNames = set.creators?.map(c => c.canonical_name).join(' & ') || 'Unknown Creator';

    return (
        <Container size="xl" pb={selectionMode ? 100 : "xl"}>
            {/* Header Navigation */}
            <Group justify="space-between" mb="lg">
                <Button 
                    variant="subtle" 
                    leftSection={<IconArrowLeft size={16} />} 
                    onClick={() => navigate(-1)} 
                    color="gray"
                >
                    Back to Library
                </Button>

                <Group gap="xs">
                    {selectionMode && (
                        <Button 
                            variant="subtle" 
                            size="sm" 
                            onClick={handleSelectAll}
                            disabled={selectedImageIds.size === (set.images?.length || 0)}
                        >
                            Select All
                        </Button>
                    )}
                    <Button 
                        variant={selectionMode ? "filled" : "light"} 
                        color={selectionMode ? "blue" : "gray"}
                        leftSection={selectionMode ? <IconCheck size={16} /> : null}
                        onClick={() => selectionMode ? clearSelection() : setSelectionMode(true)}
                    >
                        {selectionMode ? "Finish Selecting" : "Select Items"}
                    </Button>
                </Group>
            </Group>

            {/* Hero Section */}
            <Group justify="space-between" align="flex-start" mb="xl">
                <Stack gap={4}>
                    <Title order={1}>{set.title || 'Untitled Set'}</Title>
                    <Group gap="xs">
                        <Text size="lg" c="dimmed">{creatorNames}</Text>
                        <Text c="dimmed" size="lg">•</Text>
                        <Badge size="lg" variant="dot">{set.images?.length || 0} Images</Badge>
                        <Badge size="lg" variant="outline" color="gray">{set.date_added}</Badge>
                    </Group>
                    {set.notes && (
                        <Text mt="md" fs="italic" c="dimmed" style={{ maxWidth: 800 }}>"{set.notes}"</Text>
                    )}
                    
                    {/* Metadata Badges */}
                    {set.tags && (
                        <Group gap="xs" mt="sm">
                            {set.tags.split(',').filter(t => t.trim()).map(tag => (
                                <Badge key={tag} variant="light" color="gray" leftSection={<IconTag size={12} />}>
                                    {tag}
                                </Badge>
                            ))}
                        </Group>
                    )}
                </Stack>

                <Group>
                    <Button 
                        leftSection={<IconRefresh size={18} />} 
                        variant="light"
                        color="blue"
                        onClick={handleResync}
                        loading={resyncMutation.isPending}
                    >
                        Resync Folder
                    </Button>
                    <Button 
                        leftSection={<IconFolder size={18} />} 
                        variant="light"
                        onClick={handleOpenFolder}
                    >
                        Open Folder
                    </Button>
                    <Button 
                        leftSection={<IconSettings size={18} />} 
                        variant="outline"
                        onClick={() => setIsEditModalOpen(true)}
                    >
                        Edit Set Details
                    </Button>
                    <Menu shadow="md" width={200} position="bottom-end">
                        <Menu.Target>
                            <ActionIcon variant="outline" size="lg" radius="md">
                                <IconDotsVertical size={18} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>Management</Menu.Label>
                            {set.source_url && (
                                <Menu.Item 
                                    component="a" 
                                    href={set.source_url} 
                                    target="_blank" 
                                    leftSection={<IconExternalLink size={14} />}
                                >
                                    Source URL
                                </Menu.Item>
                            )}
                            <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={handleDelete}>
                                Delete Set
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </Group>

            {/* Image Gallery (Masonry Layout) */}
            <Box style={{ 
                columnCount: 4, 
                columnGap: '16px',
            }} className="masonry-grid">
                {set.images?.map((img, index) => (
                    <ImageGridItem 
                        key={img.id} 
                        image={img} 
                        onClick={() => setSelectedImageIndex(index)}
                        selectionMode={selectionMode}
                        selected={selectedImageIds.has(img.id)}
                        onToggleSelect={() => toggleImageSelect(img.id)}
                    />
                ))}
            </Box>

            {/* Floating Bulk Action Bar */}
            <Transition mounted={selectionMode && selectedImageIds.size > 0} transition="slide-up" duration={400} timingFunction="ease">
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
                            minWidth: 300
                        }}
                    >
                        <Group justify="space-between" wrap="nowrap" gap="xl">
                            <Group gap="sm">
                                <ActionIcon variant="subtle" color="gray" onClick={clearSelection} radius="xl">
                                    <IconX size={18} />
                                </ActionIcon>
                                <Text fw={600} size="sm">
                                    {selectedImageIds.size} images selected
                                </Text>
                            </Group>

                            <Button
                                size="xs"
                                variant="filled"
                                leftSection={<IconPhotoEdit size={14} />}
                                radius="xl"
                                onClick={() => setIsBulkEditOpen(true)}
                            >
                                Bulk Edit Images
                            </Button>                        </Group>
                    </Paper>
                )}
            </Transition>

            {/* Lightbox Modal */}
            <Lightbox 
                images={set.images || []}
                selectedIndex={selectedImageIndex}
                onClose={() => setSelectedImageIndex(null)}
                onSelectIndex={setSelectedImageIndex}
                onEdit={(img) => setEditingImage(img)}
                onDelete={() => refetch()}
            />

            {/* Set Edit Modal */}
            <Modal 
                opened={isEditModalOpen} 
                onClose={() => {
                    setIsEditModalOpen(false);
                    setEnablePathEdit(false);
                }} 
                title="Edit Set Metadata"
                size="lg"
                radius="md"
            >
                <Stack gap="md">
                    <TextInput 
                        label="Set Title" 
                        value={editForm.title} 
                        onChange={(e) => setEditForm({ ...editForm, title: e.currentTarget.value })}
                    />
                    <MultiSelect
                        label="Artists / Creators"
                        placeholder="Pick artists"
                        data={creatorOptions}
                        value={editForm.creator_ids}
                        onChange={(ids) => setEditForm({ ...editForm, creator_ids: ids })}
                        searchable
                        clearable
                    />
                    <TagsInput 
                        label="Tags"
                        placeholder="Add tags..."
                        value={editForm.tags}
                        onChange={(tags) => setEditForm({ ...editForm, tags })}
                    />
                    <TextInput 
                        label="Source URL" 
                        value={editForm.source_url} 
                        onChange={(e) => setEditForm({ ...editForm, source_url: e.currentTarget.value })}
                    />
                    <Textarea 
                        label="Notes"
                        placeholder="Personal notes about this set..."
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.currentTarget.value })}
                        minRows={3}
                    />

                    <Box mt="md" p="md" style={{ border: '1px red dashed', borderRadius: '8px' }}>
                        <Group justify="space-between" mb="xs">
                            <Text size="sm" fw={700} c="red">Danger Zone: Folder Path</Text>
                            <Switch 
                                checked={enablePathEdit} 
                                onChange={(e) => setEnablePathEdit(e.currentTarget.checked)}
                                color="red"
                                size="sm"
                                label="Enable manual path correction"
                            />
                        </Group>
                        <Text size="xs" c="dimmed" mb="sm">
                            Only edit this if the database mapping is incorrect (e.g. you moved the folder manually). 
                            The backend automatically renames folders to match Title/Artist updates.
                        </Text>
                        <TextInput 
                            placeholder="C:\Paths\To\Your\Set"
                            value={editForm.local_path}
                            onChange={(e) => setEditForm({ ...editForm, local_path: e.currentTarget.value })}
                            disabled={!enablePathEdit}
                            leftSection={enablePathEdit ? <IconLockOpen size={14} /> : <IconLock size={14} />}
                        />
                    </Box>

                    <Button fullWidth onClick={handleUpdate} mt="md">Save Changes</Button>
                </Stack>
            </Modal>

            {/* Image Edit Modal */}
            <ImageEditModal 
                image={editingImage}
                opened={!!editingImage}
                onClose={() => setEditingImage(null)}
                onUpdated={() => refetch()}
            />

            {/* Image Bulk Edit Modal */}
            <ImageBulkEditModal 
                opened={isBulkEditOpen}
                onClose={() => setIsBulkEditOpen(false)}
                onConfirm={handleBulkEditConfirm}
                loading={bulkUpdateMutation.isPending}
                selectedCount={selectedImageIds.size}
            />

            <style dangerouslySetInnerHTML={{ __html: `
                @media (max-width: 1200px) { .masonry-grid { column-count: 3 !important; } }
                @media (max-width: 900px) { .masonry-grid { column-count: 2 !important; } }
                @media (max-width: 600px) { .masonry-grid { column-count: 1 !important; } }

                .image-card:hover .image-overlay {
                    opacity: 1 !important;
                }
                .image-card img {
                    transition: transform 0.3s ease;
                }
                .image-card:hover img {
                    transform: scale(1.05);
                }
            `}} />
        </Container>
    );
}
