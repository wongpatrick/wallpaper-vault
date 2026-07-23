/**
 * @file
 * Module: Set Detail Page
 * Description: Displays detailed information and a gallery view for a specific wallpaper set, supporting selection, bulk editing, and syncing.
 */
import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSelection } from '../../hooks/useSelection';
import { 
    Container, Loader, Center, Alert, Button, Modal,
    TextInput, Textarea, Stack, Group, Switch, TagsInput
} from '@mantine/core';
import { IconAlertCircle, IconArrowLeft, IconLock, IconLockOpen } from '@tabler/icons-react';
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
import type { Image as ImageModel, BulkOperationMode, SetUpdate, Set as SetModel } from '../../api/model';

import { SetHeader } from './components/SetHeader';
import { SetImageGallery } from './components/SetImageGallery';

type ActiveModalState = 'editSet' | 'bulkEdit' | 'move' | 'addToPlaylist' | null;

export default function SetDetail() {
    const { setId } = useParams<{ setId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // Queries & Mutations
    const { data: set, isLoading, error, refetch } = useReadSetApiSetsSetIdGet(Number(setId));
    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 });
    const deleteMutation = useDeleteSetApiSetsSetIdDelete();
    const updateMutation = useUpdateSetApiSetsSetIdPatch();
    const resyncMutation = useResyncSetApiSetsSetIdResyncPost();
    const autoTagMutation = useAutoTagSetApiSetsSetIdAutoTagPost();
    const bulkUpdateMutation = useBulkUpdateImagesApiImagesBulkUpdatePost();
    const createCreatorMutation = useCreateCreatorApiCreatorsPost();

    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [activeModal, setActiveModal] = useState<ActiveModalState>(null);
    const [enablePathEdit, setEnablePathEdit] = useState(false);
    const [editingImage, setEditingImage] = useState<ImageModel | null>(null);
    const [croppingImage, setCroppingImage] = useState<ImageModel | null>(null);
    const [movingSingleImage, setMovingSingleImage] = useState<ImageModel | null>(null);

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

    const [editForm, setEditForm] = useState({
        title: '',
        notes: '',
        source_url: '',
        local_path: '',
        creator_names: [] as string[],
        tags: [] as string[],
        characters: [] as string[]
    });

    const [prevSet, setPrevSet] = useState<SetModel | null>(null);
    if (set && set !== prevSet) {
        setPrevSet(set);
        if (activeModal !== 'editSet') {
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
    }

    const taskStatus = activeTask?.status;

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

    if (isLoading) {
        return <Center h={400}><Loader size="xl" /></Center>;
    }

    if (error || !set) {
        return (
            <Container fluid px="xl">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red">
                    Could not fetch the set details.
                </Alert>
                <Button 
                    variant="subtle" 
                    leftSection={<IconArrowLeft size={16} />} 
                    onClick={() => {
                        if (location.state?.from) {
                            navigate(-1);
                        } else {
                            navigate('/sets');
                        }
                    }} 
                    mt="md"
                >
                    Back to {location.state?.fromLabel || "Sets"}
                </Button>
            </Container>
        );
    }

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
            setActiveModal(null);
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
                <Alert color="red" title="Warning">
                    Are you sure you want to delete the set <b>"{set?.title}"</b> ({set?.images?.length || 0} images)? This will permanently remove all images in this set from your computer. This action cannot be undone.
                </Alert>
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
            setActiveModal(null);
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
        setMovingSingleImage(null);
        setActiveModal(null);
        refetch();
    };

    return (
        <Container fluid px="xl" pb={selectionMode ? 100 : "xl"} pos="relative">
            <SetHeader 
                set={set}
                selectionMode={selectionMode}
                setSelectionMode={setSelectionMode}
                selectedImageIds={selectedImageIds}
                clearSelection={clearSelection}
                handleSelectAll={handleSelectAll}
                handleResync={handleResync}
                handleOpenFolder={handleOpenFolder}
                onOpenEditModal={() => setActiveModal('editSet')}
                handleAutoTag={handleAutoTag}
                handleDelete={handleDelete}
                resyncPending={resyncMutation.isPending}
                autoTagPending={autoTagMutation.isPending}
                isLocalTaggingActive={isLocalTaggingActive}
                isAnyTaggingActive={isAnyTaggingActive}
            />

            <SetImageGallery 
                images={set.images}
                selectionMode={selectionMode}
                selectedImageIds={selectedImageIds}
                toggleImageSelect={toggleImageSelect}
                onImageClick={(index) => setSelectedImageIndex(index)}
                onEditImage={(img) => setEditingImage(img)}
                onCropImage={(img) => setCroppingImage(img)}
                onMoveImage={(img) => {
                    setMovingSingleImage(img);
                    setActiveModal('move');
                }}
            />

            {/* Lightbox for full size preview */}
            {selectedImageIndex !== null && set.images && (
                <ImageLightbox 
                    images={set.images}
                    initialIndex={selectedImageIndex}
                    onClose={() => setSelectedImageIndex(null)}
                    onUpdate={refetch}
                />
            )}

            {/* Edit Image Modal */}
            {editingImage && (
                <ImageEditModal 
                    image={editingImage}
                    opened={!!editingImage}
                    onClose={() => setEditingImage(null)}
                    onSuccess={() => {
                        setEditingImage(null);
                        refetch();
                    }}
                />
            )}

            {/* Crop Image Modal */}
            {croppingImage && (
                <ImageCropModal 
                    image={croppingImage}
                    opened={!!croppingImage}
                    onClose={() => setCroppingImage(null)}
                    onSuccess={() => {
                        setCroppingImage(null);
                        refetch();
                    }}
                />
            )}

            {/* Move Image Modal */}
            <ImageMoveModal 
                imageIds={movingSingleImage ? [movingSingleImage.id] : Array.from(selectedImageIds)}
                opened={activeModal === 'move' || !!movingSingleImage}
                onClose={() => {
                    setActiveModal(null);
                    setMovingSingleImage(null);
                }}
                onSuccess={handleMoveSuccess}
            />

            {/* Bulk Edit Modal */}
            <ImageBulkEditModal 
                opened={activeModal === 'bulkEdit'}
                onClose={() => setActiveModal(null)}
                selectedCount={selectedImageIds.size}
                onConfirm={handleBulkEditConfirm}
                isPending={bulkUpdateMutation.isPending}
            />

            {/* Add to Playlist Modal */}
            <AddToPlaylistModal 
                opened={activeModal === 'addToPlaylist'}
                onClose={() => setActiveModal(null)}
                imageIds={Array.from(selectedImageIds)}
                onSuccess={() => {
                    clearSelection();
                    refetch();
                }}
            />

            {/* Floating Selection Bar */}
            <FloatingSelectionBar 
                selectedCount={selectedImageIds.size}
                onClearSelection={clearSelection}
                onBulkEdit={() => setActiveModal('bulkEdit')}
                onMove={() => setActiveModal('move')}
                onAddToPlaylist={() => setActiveModal('addToPlaylist')}
            />

            {/* Edit Set Modal */}
            <Modal 
                opened={activeModal === 'editSet'} 
                onClose={() => setActiveModal(null)} 
                title="Edit Set Details"
                size="lg"
            >
                <Stack gap="md">
                    <TextInput 
                        label="Set Title" 
                        value={editForm.title} 
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        required
                    />
                    
                    <TagsInput 
                        label="Creators / Authors"
                        placeholder="Type creator name and press Enter"
                        data={creatorOptions}
                        value={editForm.creator_names}
                        onChange={(val) => setEditForm({ ...editForm, creator_names: val })}
                        description="Add one or more creators who produced this wallpaper set."
                    />

                    <TextInput 
                        label="Source URL" 
                        placeholder="https://..."
                        value={editForm.source_url} 
                        onChange={(e) => setEditForm({ ...editForm, source_url: e.target.value })}
                    />

                    <Textarea 
                        label="Notes" 
                        placeholder="Additional notes about this set..."
                        value={editForm.notes} 
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        rows={3}
                    />

                    <CharacterTagsInput 
                        value={editForm.characters}
                        onChange={(val) => setEditForm({ ...editForm, characters: val })}
                    />

                    <TagAutocompleteInput 
                        label="Tags"
                        value={editForm.tags}
                        onChange={(val) => setEditForm({ ...editForm, tags: val })}
                    />

                    <Switch 
                        label="Enable local folder path editing" 
                        checked={enablePathEdit} 
                        onChange={(e) => setEnablePathEdit(e.currentTarget.checked)} 
                        thumbIcon={
                            enablePathEdit ? (
                                <IconLockOpen size="0.8rem" color="var(--mantine-color-blue-6)" />
                            ) : (
                                <IconLock size="0.8rem" color="var(--mantine-color-gray-6)" />
                            )
                        }
                    />

                    {enablePathEdit && (
                        <TextInput 
                            label="Local Path" 
                            value={editForm.local_path} 
                            onChange={(e) => setEditForm({ ...editForm, local_path: e.target.value })}
                            description="Warning: Changing local path without moving the actual folder on disk might cause missing files."
                        />
                    )}

                    <Group justify="flex-end" mt="md">
                        <Button variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
                        <Button onClick={handleUpdate} loading={updateMutation.isPending}>Save Changes</Button>
                    </Group>
                </Stack>
            </Modal>
        </Container>
    );
}
