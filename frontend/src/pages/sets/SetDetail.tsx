/**
 * @file
 * Module: Set Detail Page
 * Description: Displays detailed information and a gallery view for a specific wallpaper set, supporting selection, bulk editing, and syncing.
 */
import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelection } from '../../hooks/useSelection';
import { 
    Title, Text, Container, Group, Badge, Loader, 
    Center, Alert, Stack, ActionIcon, Menu, Button, Modal,
    TextInput, Textarea, Box, Switch, TagsInput
} from '@mantine/core';
import { 
    IconAlertCircle, IconArrowLeft, IconDotsVertical, IconTrash, 
    IconExternalLink, IconFolder, IconTag, IconLock, IconLockOpen, IconRefresh, IconCheck,
    IconSettings, IconPhotoEdit, IconArrowRight, IconSparkles, IconPlaylist
} from '@tabler/icons-react';
import { 
    useReadSetApiSetsSetIdGet, 
    useDeleteSetApiSetsSetIdDelete,
    useUpdateSetApiSetsSetIdPatch,
    useResyncSetApiSetsSetIdResyncPost,
    useAutoTagSetApiSetsSetIdAutoTagPost
} from '../../api/generated/sets/sets';

import { useBulkUpdateImagesApiImagesBulkUpdatePost } from '../../api/generated/images/images';
import { useReadCreatorsApiCreatorsGet, useCreateCreatorApiCreatorsPost } from '../../api/generated/creators/creators';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { ImageGridItem } from '../../components/images/ImageGridItem';
import { ImageLightbox } from '../../components/images/ImageLightbox';
import { ImageEditModal } from '../../components/images/ImageEditModal';
import { ImageBulkEditModal } from '../../components/images/ImageBulkEditModal';
import { ImageMoveModal } from '../../components/images/ImageMoveModal';
import { TagAutocompleteInput } from '../../components/ui/TagAutocompleteInput';
import { ImageCropModal } from '../../components/images/ImageCropModal';
import { CharacterTagsInput } from '../../components/ui/CharacterTagsInput';
import { FloatingSelectionBar } from '../../components/ui/FloatingSelectionBar';
import { AddToPlaylistModal } from '../../components/playlists/AddToPlaylistModal';
import { useTasks } from '../../hooks/useTasks';
import type { Image as ImageModel, BulkOperationMode, SetUpdate } from '../../api/model';

export default function SetDetail() {
    const { setId } = useParams<{ setId: string }>();
    const navigate = useNavigate();

    
    // 1. All hooks at the top
    const { data: set, isLoading, error, refetch } = useReadSetApiSetsSetIdGet(Number(setId));
    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 });
    const deleteMutation = useDeleteSetApiSetsSetIdDelete();
    const updateMutation = useUpdateSetApiSetsSetIdPatch();
    const resyncMutation = useResyncSetApiSetsSetIdResyncPost();
    const autoTagMutation = useAutoTagSetApiSetsSetIdAutoTagPost();
    const bulkUpdateMutation = useBulkUpdateImagesApiImagesBulkUpdatePost();
    const createCreatorMutation = useCreateCreatorApiCreatorsPost();

    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [enablePathEdit, setEnablePathEdit] = useState(false);
    const [editingImage, setEditingImage] = useState<ImageModel | null>(null);
    const [croppingImage, setCroppingImage] = useState<ImageModel | null>(null);

    const { getTaskForSet, tasks } = useTasks();
    const activeTask = getTaskForSet(Number(setId));
    const isLocalTaggingActive = activeTask?.status === 'accepted' || activeTask?.status === 'processing';
    const isAnyTaggingActive = useMemo(() => {
        return Object.values(tasks).some(
            (t) => t.id.startsWith('autotag-') && (t.status === 'accepted' || t.status === 'processing')
        );
    }, [tasks]);

    // Selection State
    const { selectionMode, setSelectionMode, selectedIds: selectedImageIds, toggle: toggleImageSelect, selectAll, clear: clearSelection } = useSelection();
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
    
    const [editForm, setEditForm] = useState({
        title: '',
        notes: '',
        source_url: '',
        local_path: '',
        creator_names: [] as string[],
        tags: [] as string[],
        characters: [] as string[]
    });

    const [prevSetId, setPrevSetId] = useState<number | null>(null);
    if (set && set.id !== prevSetId) {
        setPrevSetId(set.id);
        setEditForm({
            title: set.title || '',
            notes: set.notes || '',
            source_url: set.source_url || '',
            local_path: set.local_path || '',
            creator_names: set.creators?.map(c => c.canonical_name) || [],
            tags: Array.from(new Set(set.tags || [])),
            characters: Array.from(new Set(set.characters || []))
        });
    }

    const taskStatus = activeTask?.status;

    // Trigger metadata sync and refetch when the auto-tagging task finishes successfully
    useEffect(() => {
        if (taskStatus === 'completed') {
            refetch().then((result) => {
                if (result.data) {
                    setEditForm({
                        title: result.data.title || '',
                        notes: result.data.notes || '',
                        source_url: result.data.source_url || '',
                        local_path: result.data.local_path || '',
                        creator_names: result.data.creators?.map(c => c.canonical_name) || [],
                        tags: Array.from(new Set(result.data.tags || [])),
                        characters: Array.from(new Set(result.data.characters || []))
                    });
                }
            });
        }
    }, [taskStatus, refetch]);

    const creatorOptions = useMemo(() => {
        const uniqueNames = new Set(creatorsData?.items?.map(c => c.canonical_name) || []);
        return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b));
    }, [creatorsData]);

    // 2. Early returns
    if (isLoading) {
        return <Center h={400}><Loader size="xl" /></Center>;
    }

    if (error || !set) {
        return (
            <Container fluid px="xl">
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
            const { local_path, creator_names, ...otherFields } = editForm;
            
            const finalCreatorIds: number[] = [];
            for (const name of creator_names) {
                const trimmedName = name.trim();
                if (!trimmedName) continue;
                
                const existing = creatorsData?.items?.find(
                    c => c.canonical_name.toLowerCase() === trimmedName.toLowerCase()
                );
                
                if (existing) {
                    finalCreatorIds.push(existing.id);
                } else {
                    const newCreator = await createCreatorMutation.mutateAsync({
                        data: { canonical_name: trimmedName }
                    });
                    finalCreatorIds.push(newCreator.id);
                }
            }

            const updateData: SetUpdate = {
                title: otherFields.title,
                notes: otherFields.notes || undefined,
                source_url: otherFields.source_url || undefined,
                creator_ids: finalCreatorIds,
                tags: editForm.tags,
                characters: editForm.characters
            };
            if (enablePathEdit) {
                updateData.local_path = local_path;
            }

            await updateMutation.mutateAsync({
                setId: Number(setId),
                data: updateData
            });
            notifications.show({ title: 'Success', message: 'Set metadata updated', color: 'green' });
            setIsEditModalOpen(false);
            setEnablePathEdit(false);
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
                    Are you sure you want to delete the set <b>"{set?.title}"</b> ({set?.images?.length || 0} images)? This will permanently remove all images in this set from your computer. This action cannot be undone.
                </Text>
            ),
            labels: { confirm: 'Delete permanently', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    await deleteMutation.mutateAsync({ setId: Number(setId) });
                    notifications.show({ title: 'Set deleted', message: 'Set removed from vault', color: 'blue' });
                    navigate('/sets');
                } catch (err) {
                    const axiosError = err as { response?: { data?: { detail?: string } } };
                    const message = axiosError.response?.data?.detail || 'Could not delete set';
                    notifications.show({
                        title: 'Error',
                        message: typeof message === 'string' ? message : 'Could not delete set',
                        color: 'red',
                        autoClose: 10000
                    });
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

    const handleAutoTag = async () => {
        try {
            await autoTagMutation.mutateAsync({ setId: Number(setId) });
        } catch (err) {
            console.error('Auto tagging failed:', err);
            notifications.show({
                title: 'Error',
                message: 'Failed to start AI auto-tagging.',
                color: 'red',
            });
        }
    };



    const handleSelectAll = () => {
        if (!set?.images) return;
        selectAll(set.images.map(img => img.id));
    };

    const handleBulkEditConfirm = async (data: Partial<{ rating: string; notes: string }>, mode: BulkOperationMode) => {
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

    const handleMoveSuccess = () => {
        clearSelection();
        refetch();
    };



    return (
        <Container fluid px="xl" pb={selectionMode ? 100 : "xl"} pos="relative">
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
            <Stack gap="md" mb="xl">
                {/* Title & Actions Row */}
                <Group justify="space-between" align="center">
                    <Title order={1}>{set.title || 'Untitled Set'}</Title>
                    <Group>
                        <Button 
                            leftSection={<IconRefresh size={18} />} 
                            variant="light"
                            color="blue"
                            onClick={handleResync}
                            loading={resyncMutation.isPending}
                            disabled={autoTagMutation.isPending || isLocalTaggingActive}
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
                            disabled={autoTagMutation.isPending || isLocalTaggingActive}
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
                                <Menu.Item 
                                    leftSection={<IconSparkles size={14} />} 
                                    onClick={handleAutoTag}
                                    disabled={autoTagMutation.isPending || isAnyTaggingActive}
                                >
                                    Run AI Auto-Tagging
                                </Menu.Item>
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
                                 <Menu.Item 
                                    leftSection={<IconTrash size={14} />} 
                                    color="red" 
                                    onClick={handleDelete}
                                    disabled={autoTagMutation.isPending || isLocalTaggingActive}
                                >
                                    Delete Set
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Group>

                {/* Subtitle Details */}
                <Group gap="xs">
                    {set.creators && set.creators.length > 0 ? (
                        set.creators.map(c => (
                            <Badge 
                                key={c.id} 
                                size="lg" 
                                variant="light" 
                                color="indigo" 
                                style={{ cursor: 'pointer', textTransform: 'none' }}
                                onClick={() => navigate(`/creators/${c.id}`)}
                            >
                                {c.canonical_name}
                            </Badge>
                        ))
                    ) : (
                        <Text size="lg" c="dimmed">Unknown Creator</Text>
                    )}
                    <Text c="dimmed" size="lg">•</Text>
                    <Badge size="lg" variant="dot">{set.images?.length || 0} Images</Badge>
                    <Badge size="lg" variant="outline" color="gray">{set.date_added}</Badge>
                </Group>

                {/* Notes */}
                {set.notes && (
                    <Text fs="italic" c="dimmed" style={{ maxWidth: 800 }}>"{set.notes}"</Text>
                )}
                
                {/* Metadata Badges */}
                {((set.tags && set.tags.length > 0) || 
                  (set.characters && set.characters.length > 0)) && (
                    <Group gap="xs" mt="xs">
                        {set.tags && set.tags.map(tag => (
                            <Badge 
                                key={tag} 
                                variant="light" 
                                color="gray" 
                                leftSection={<IconTag size={12} />}
                                style={{ cursor: 'pointer', textTransform: 'none' }}
                                onClick={() => navigate(`/images?tag=${encodeURIComponent(tag)}`)}
                            >
                                {tag}
                            </Badge>
                        ))}
                        {set.characters && set.characters.map(char => {
                            const hasFranchise = char.includes(' (');
                            const rawName = hasFranchise ? char.split(' (')[0] : char;
                            const franchiseName = hasFranchise ? char.split(' (')[1].slice(0, -1) : null;
                            
                            if (franchiseName) {
                                return (
                                    <Group key={char} gap={0} style={{ display: 'inline-flex', verticalAlign: 'middle', borderRadius: '4px', overflow: 'hidden' }}>
                                        <Badge 
                                            variant="light" 
                                            color="blue"
                                            style={{ cursor: 'pointer', textTransform: 'none', borderTopRightRadius: 0, borderBottomRightRadius: 0, paddingRight: 6 }}
                                            onClick={() => navigate(`/images?character=${encodeURIComponent(rawName)}`)}
                                        >
                                            {rawName}
                                        </Badge>
                                        <Badge 
                                            variant="light" 
                                            color="orange"
                                            style={{ cursor: 'pointer', textTransform: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0, paddingLeft: 6 }}
                                            onClick={() => navigate(`/images?franchise=${encodeURIComponent(franchiseName)}`)}
                                        >
                                            {franchiseName}
                                        </Badge>
                                    </Group>
                                );
                            }

                            return (
                                <Badge 
                                    key={char} 
                                    variant="light" 
                                    color="blue"
                                    style={{ cursor: 'pointer', textTransform: 'none' }}
                                    onClick={() => navigate(`/images?character=${encodeURIComponent(rawName)}`)}
                                >
                                    {char}
                                </Badge>
                            );
                        })}
                    </Group>
                )}
            </Stack>

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
            <FloatingSelectionBar
                mounted={selectionMode && selectedImageIds.size > 0}
                selectedCount={selectedImageIds.size}
                onClear={clearSelection}
                itemLabel="images"
                minWidth={300}
            >
                <Button
                    size="xs"
                    variant="light"
                    color="violet"
                    leftSection={<IconPlaylist size={14} />}
                    radius="xl"
                    onClick={() => setIsAddToPlaylistOpen(true)}
                    disabled={autoTagMutation.isPending || isLocalTaggingActive}
                >
                    Add to Playlist
                </Button>
                <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconArrowRight size={14} />}
                    radius="xl"
                    onClick={() => setIsMoveModalOpen(true)}
                    disabled={autoTagMutation.isPending || isLocalTaggingActive}
                >
                    Move to Set
                </Button>
                <Button
                    size="xs"
                    variant="filled"
                    leftSection={<IconPhotoEdit size={14} />}
                    radius="xl"
                    onClick={() => setIsBulkEditOpen(true)}
                    disabled={autoTagMutation.isPending || isLocalTaggingActive}
                >
                    Bulk Edit
                </Button>
            </FloatingSelectionBar>

            {/* ImageLightbox Modal */}
            <ImageLightbox 
                images={set.images || []}
                selectedIndex={selectedImageIndex}
                onClose={() => setSelectedImageIndex(null)}
                onSelectIndex={setSelectedImageIndex}
                onEdit={(img) => setEditingImage(img)}
                onDelete={() => refetch()}
                disableActions={autoTagMutation.isPending || isLocalTaggingActive}
                onCrop={(img) => setCroppingImage(img)}
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
                    <TagsInput
                        label="Artists / Creators"
                        placeholder="Type to create new or select existing"
                        data={creatorOptions}
                        value={editForm.creator_names}
                        onChange={(names) => setEditForm({ ...editForm, creator_names: names })}
                        clearable
                    />
                    <TagAutocompleteInput 
                        label="Tags"
                        placeholder="Add tags..."
                        value={editForm.tags}
                        onChange={(tags) => setEditForm({ ...editForm, tags })}
                    />
                    <CharacterTagsInput 
                        label="Characters"
                        placeholder="Add characters..."
                        value={editForm.characters}
                        onChange={(characters) => setEditForm({ ...editForm, characters })}
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

                    <Button 
                        fullWidth 
                        onClick={handleUpdate} 
                        mt="md"
                        loading={updateMutation.isPending || createCreatorMutation.isPending}
                    >
                        Save Changes
                    </Button>
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

            {/* Image Move Modal */}
            <ImageMoveModal 
                opened={isMoveModalOpen}
                onClose={() => setIsMoveModalOpen(false)}
                selectedImageIds={Array.from(selectedImageIds)}
                onSuccess={handleMoveSuccess}
            />

            {/* Image Crop Modal */}
            {croppingImage && (
                <ImageCropModal 
                    key={croppingImage.id}
                    image={croppingImage}
                    opened={!!croppingImage}
                    onClose={() => setCroppingImage(null)}
                    onCropSuccess={() => refetch()}
                />
            )}

            {/* Add to Playlist Modal */}
            <AddToPlaylistModal 
                opened={isAddToPlaylistOpen}
                onClose={() => setIsAddToPlaylistOpen(false)}
                imageIds={Array.from(selectedImageIds)}
                onSuccess={() => {
                    clearSelection();
                    refetch();
                }}
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
