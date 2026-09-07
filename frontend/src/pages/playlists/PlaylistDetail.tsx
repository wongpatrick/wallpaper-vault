/**
 * @file
 * Module: Playlist Detail Page
 * Description: Displays a single custom collection of wallpapers, supporting local and cross-vault collections with drag-and-drop reordering.
 */
import { useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Text, Button, Center, Loader, Alert } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconArrowLeft, IconPlaylist, IconPlus } from '@tabler/icons-react';
import {
    useReadPlaylistApiPlaylistsPlaylistIdGet,
    useRemoveImagesApiPlaylistsPlaylistIdImagesDelete,
    useReorderImagesApiPlaylistsPlaylistIdImagesReorderPut,
    useReadPlaylistRandomImageApiPlaylistsPlaylistIdRandomGet
} from '../../api/generated/playlists/playlists';
import { useVault } from '../../hooks/useVault';
import { AXIOS_INSTANCE } from '../../api/axios-instance';
import { ImageLightbox } from '../../components/images/ImageLightbox';
import { PlaylistRotationUrlModal } from '../../components/playlists/PlaylistRotationUrlModal';
import { CrossVaultImagePickerModal } from '../../components/playlists/CrossVaultImagePickerModal';
import { PlaylistHeader } from './PlaylistHeader';
import { PlaylistImageList } from './PlaylistImageList';
import { PlaylistEditModal } from './PlaylistEditModal';

export default function PlaylistDetail() {
    const { playlistId } = useParams<{ playlistId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const numericId = Number(playlistId);
    const { vaults } = useVault();

    const { data: rawPlaylist, isLoading, error, refetch } = useReadPlaylistApiPlaylistsPlaylistIdGet(numericId);
    const playlist = rawPlaylist as typeof rawPlaylist & {
        is_cross_vault?: boolean;
        cross_vault_images?: Array<{ vault_id: string; image_id: number; sort_order: number; vault_label?: string }>;
    };

    const removeMutation = useRemoveImagesApiPlaylistsPlaylistIdImagesDelete();
    const reorderMutation = useReorderImagesApiPlaylistsPlaylistIdImagesReorderPut();
    const randomImageQuery = useReadPlaylistRandomImageApiPlaylistsPlaylistIdRandomGet(numericId, undefined, {
        query: { enabled: false }
    });

    const [lightboxImageIndex, setLightboxImageIndex] = useState<number | null>(null);

    // Drag-and-drop state
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [rotationModalOpened, setRotationModalOpened] = useState(false);
    const [editModalOpened, setEditModalOpened] = useState(false);
    const [addVaultModalOpened, setAddVaultModalOpened] = useState(false);

    const isCrossVault = !!playlist?.is_cross_vault;

    const crossVaultImages = useMemo(() => {
        if (!playlist?.cross_vault_images) return [];
        return [...playlist.cross_vault_images].sort((a, b) => a.sort_order - b.sort_order);
    }, [playlist]);

    const imagesWithOrder = useMemo(() => {
        if (!playlist?.images) return [];
        return [...playlist.images].sort((a, b) => a.sort_order - b.sort_order);
    }, [playlist]);

    const imagesOnly = useMemo(() => {
        return imagesWithOrder.map(imgOrder => imgOrder.image);
    }, [imagesWithOrder]);

    const totalItemCount = isCrossVault ? crossVaultImages.length : imagesWithOrder.length;

    const handleCopyRotationUrl = () => {
        setRotationModalOpened(true);
    };

    const handleTriggerRandomPreview = async () => {
        try {
            const result = await randomImageQuery.refetch();
            if (result.data) {
                const idx = imagesOnly.findIndex(img => img.id === result.data.id);
                if (idx !== -1) {
                    setLightboxImageIndex(idx);
                } else {
                    notifications.show({
                        title: 'Random Image',
                        message: `Fetched: ${result.data.filename}`,
                        color: 'blue'
                    });
                }
            }
        } catch {
            notifications.show({
                title: 'Error',
                message: 'Could not fetch a random image.',
                color: 'red'
            });
        }
    };

    const handleRemoveImage = async (imgId: number) => {
        try {
            await removeMutation.mutateAsync({
                playlistId: numericId,
                data: { image_ids: [imgId] }
            });
            notifications.show({
                title: 'Removed',
                message: 'Wallpaper removed from playlist.',
                color: 'blue'
            });
            refetch();
        } catch {
            notifications.show({
                title: 'Error',
                message: 'Could not remove image.',
                color: 'red'
            });
        }
    };

    const handleRemoveCrossVaultImage = async (vaultId: string, imageId: number) => {
        try {
            await AXIOS_INSTANCE.delete(`/api/playlists/${numericId}/cross-vault-images`, {
                data: { images: [{ vault_id: vaultId, image_id: imageId }] }
            });
            notifications.show({
                title: 'Removed',
                message: 'Wallpaper removed from cross-vault playlist.',
                color: 'blue'
            });
            refetch();
        } catch {
            notifications.show({
                title: 'Error',
                message: 'Could not remove cross-vault image.',
                color: 'red'
            });
        }
    };

    const handleReorder = async (newImages: typeof imagesWithOrder) => {
        const imageIds = newImages.map(x => x.image.id);
        try {
            await reorderMutation.mutateAsync({
                playlistId: numericId,
                data: { image_ids: imageIds }
            });
            refetch();
        } catch {
            notifications.show({
                title: 'Reorder Failed',
                message: 'Could not save new order to database.',
                color: 'red'
            });
        }
    };

    const handleReorderCrossVault = async (newImages: typeof crossVaultImages) => {
        try {
            await AXIOS_INSTANCE.put(`/api/playlists/${numericId}/cross-vault-images/reorder`, {
                images: newImages.map(x => ({ vault_id: x.vault_id, image_id: x.image_id }))
            });
            refetch();
        } catch {
            notifications.show({
                title: 'Reorder Failed',
                message: 'Could not save new cross-vault order to database.',
                color: 'red'
            });
        }
    };

    const handleMove = async (currentIndex: number, direction: 'up' | 'down') => {
        if (isCrossVault) {
            const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex < 0 || targetIndex >= crossVaultImages.length) return;
            const updated = [...crossVaultImages];
            const temp = updated[currentIndex];
            updated[currentIndex] = updated[targetIndex];
            updated[targetIndex] = temp;
            await handleReorderCrossVault(updated);
            return;
        }

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= imagesWithOrder.length) return;

        const updated = [...imagesWithOrder];
        const temp = updated[currentIndex];
        updated[currentIndex] = updated[targetIndex];
        updated[targetIndex] = temp;

        await handleReorder(updated);
    };

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
    };

    const handleDrop = async (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        if (isCrossVault) {
            const updated = [...crossVaultImages];
            const [draggedItem] = updated.splice(draggedIndex, 1);
            updated.splice(index, 0, draggedItem);
            setDraggedIndex(null);
            await handleReorderCrossVault(updated);
            return;
        }

        const updated = [...imagesWithOrder];
        const [draggedItem] = updated.splice(draggedIndex, 1);
        updated.splice(index, 0, draggedItem);

        setDraggedIndex(null);
        await handleReorder(updated);
    };

    if (isLoading) {
        return (
            <Center h={400}>
                <Loader size="xl" />
            </Center>
        );
    }

    if (error || !playlist) {
        return (
            <Container fluid px="xl">
                <Alert icon={<IconAlertCircle size="1.2rem" />} title="Error!" color="red" mb="md">
                    Could not fetch playlist details.
                </Alert>
                <Button 
                    variant="subtle" 
                    leftSection={<IconArrowLeft size={16} />} 
                    onClick={() => {
                        if (location.state?.from) {
                            navigate(-1);
                        } else {
                            navigate('/playlists');
                        }
                    }}
                >
                    Back to {location.state?.fromLabel || "Playlists"}
                </Button>
            </Container>
        );
    }

    return (
        <Container fluid px="xl">
            <Button
                variant="subtle"
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => {
                    if (location.state?.from) {
                        navigate(-1);
                    } else {
                        navigate('/playlists');
                    }
                }}
                mb="xl"
            >
                Back to {location.state?.fromLabel || "Playlists"}
            </Button>

            <PlaylistHeader
                name={playlist.name}
                description={playlist.description}
                isSmart={playlist.is_smart}
                isCrossVault={isCrossVault}
                totalItemCount={totalItemCount}
                onAddFromVault={() => setAddVaultModalOpened(true)}
                onEdit={() => setEditModalOpened(true)}
                onRandomPreview={handleTriggerRandomPreview}
                onCopyRotationUrl={handleCopyRotationUrl}
            />

            {totalItemCount === 0 ? (
                <Center style={{ minHeight: '30vh', flexDirection: 'column' }}>
                    <IconPlaylist size={48} style={{ opacity: 0.1 }} />
                    <Text size="lg" fw={600} c="dimmed" mt="md">
                        {playlist.is_smart ? 'No matching wallpapers' : 'This playlist is empty'}
                    </Text>
                    <Text c="dimmed" size="sm" mt={4} mb="xl">
                        {playlist.is_smart
                            ? 'No wallpapers match your current rules. Try adjusting the filter criteria.'
                            : isCrossVault
                            ? 'Add wallpapers across your connected vaults to populate this playlist.'
                            : 'Go to individual wallpapers or sets and select images to add them here.'}
                    </Text>
                    {isCrossVault ? (
                        <Button
                            variant="filled"
                            color="indigo"
                            leftSection={<IconPlus size={16} />}
                            onClick={() => setAddVaultModalOpened(true)}
                        >
                            Add from Vault
                        </Button>
                    ) : (
                        !playlist.is_smart && (
                            <Button variant="outline" onClick={() => navigate('/images')}>
                                Browse Wallpapers
                            </Button>
                        )
                    )}
                </Center>
            ) : (
                <PlaylistImageList
                    isCrossVault={isCrossVault}
                    isSmart={playlist.is_smart}
                    crossVaultImages={crossVaultImages}
                    imagesWithOrder={imagesWithOrder}
                    vaults={vaults}
                    draggedIndex={draggedIndex}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onMove={handleMove}
                    onRemoveLocalImage={handleRemoveImage}
                    onRemoveCrossVaultImage={handleRemoveCrossVaultImage}
                    onImageClick={(idx) => setLightboxImageIndex(idx)}
                />
            )}

            {/* Lightbox for viewing images */}
            {lightboxImageIndex !== null && (
                <ImageLightbox
                    images={imagesOnly}
                    selectedIndex={lightboxImageIndex}
                    onClose={() => setLightboxImageIndex(null)}
                    onSelectIndex={setLightboxImageIndex}
                    onEdit={() => {}}
                    onDelete={() => {
                        refetch();
                        setLightboxImageIndex(null);
                    }}
                    disableActions={true}
                />
            )}

            {/* Rotation URL Modal */}
            <PlaylistRotationUrlModal
                opened={rotationModalOpened}
                onClose={() => setRotationModalOpened(false)}
                playlistId={numericId}
                playlistName={playlist?.name || ''}
            />

            {/* Edit Playlist Modal */}
            <PlaylistEditModal
                opened={editModalOpened}
                onClose={() => setEditModalOpened(false)}
                playlist={playlist}
                onSuccess={() => refetch()}
            />

            {/* Cross Vault Image Picker Modal */}
            {isCrossVault && (
                <CrossVaultImagePickerModal
                    opened={addVaultModalOpened}
                    onClose={() => setAddVaultModalOpened(false)}
                    playlistId={numericId}
                    onSuccess={() => refetch()}
                />
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                .playlist-item-card:active {
                    cursor: grabbing;
                }
            `}} />
        </Container>
    );
}
