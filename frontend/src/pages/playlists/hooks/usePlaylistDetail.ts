/**
 * @file
 * Module: usePlaylistDetail hook
 * Description: Manages playlist queries, cross-vault data formatting, image reordering, deletions, and drag-and-drop interactions.
 */
import { useState, useMemo, useCallback } from 'react';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import {
    useReadPlaylistApiPlaylistsPlaylistIdGet,
    useRemoveImagesApiPlaylistsPlaylistIdImagesDelete,
    useReorderImagesApiPlaylistsPlaylistIdImagesReorderPut,
    useReadPlaylistRandomImageApiPlaylistsPlaylistIdRandomGet
} from '../../../api/generated/playlists/playlists';
import { AXIOS_INSTANCE } from '../../../api/axios-instance';
import type { Image as ImageModel, PlaylistDetail as PlaylistDetailModel } from '../../../api/model';

export type ExtendedPlaylist = PlaylistDetailModel & {
    cross_vault_images?: Array<{ vault_id: string; image_id: number; sort_order: number; vault_label?: string }>;
};

interface UsePlaylistDetailOptions {
    numericId: number;
    onOpenLightbox: (idx: number) => void;
}

export function usePlaylistDetail({ numericId, onOpenLightbox }: UsePlaylistDetailOptions) {
    const { showNotification } = useAppNotifications();

    const { data: rawPlaylist, isLoading, error, refetch } = useReadPlaylistApiPlaylistsPlaylistIdGet(numericId);
    const playlist = rawPlaylist as ExtendedPlaylist | undefined;

    const removeMutation = useRemoveImagesApiPlaylistsPlaylistIdImagesDelete();
    const reorderMutation = useReorderImagesApiPlaylistsPlaylistIdImagesReorderPut();
    const randomImageQuery = useReadPlaylistRandomImageApiPlaylistsPlaylistIdRandomGet(
        numericId,
        { log_rotation: false },
        { query: { enabled: false } }
    );

    // Drag-and-drop state
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

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
        return imagesWithOrder.map((imgOrder) => imgOrder.image as ImageModel);
    }, [imagesWithOrder]);

    const totalItemCount = isCrossVault ? crossVaultImages.length : imagesWithOrder.length;

    const handleTriggerRandomPreview = async () => {
        try {
            const result = await randomImageQuery.refetch();
            if (result.data) {
                const idx = imagesOnly.findIndex((img) => img.id === result.data.id);
                if (idx !== -1) {
                    onOpenLightbox(idx);
                } else {
                    showNotification({
                        title: 'Random Image',
                        message: `Fetched: ${result.data.filename}`,
                        color: 'blue'
                    });
                }
            }
        } catch {
            showNotification({
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
            showNotification({
                title: 'Removed',
                message: 'Wallpaper removed from playlist.',
                color: 'blue'
            });
            refetch();
        } catch {
            showNotification({
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
            showNotification({
                title: 'Removed',
                message: 'Wallpaper removed from cross-vault playlist.',
                color: 'blue'
            });
            refetch();
        } catch {
            showNotification({
                title: 'Error',
                message: 'Could not remove cross-vault image.',
                color: 'red'
            });
        }
    };

    const handleReorder = useCallback(async (newImages: typeof imagesWithOrder) => {
        const imageIds = newImages.map((x) => x.image.id);
        try {
            await reorderMutation.mutateAsync({
                playlistId: numericId,
                data: { image_ids: imageIds }
            });
            refetch();
        } catch {
            showNotification({
                title: 'Reorder Failed',
                message: 'Could not save new order to database.',
                color: 'red'
            });
        }
    }, [numericId, refetch, reorderMutation, showNotification]);

    const handleReorderCrossVault = useCallback(async (newImages: typeof crossVaultImages) => {
        try {
            await AXIOS_INSTANCE.put(`/api/playlists/${numericId}/cross-vault-images/reorder`, {
                images: newImages.map((x) => ({ vault_id: x.vault_id, image_id: x.image_id }))
            });
            refetch();
        } catch {
            showNotification({
                title: 'Reorder Failed',
                message: 'Could not save new cross-vault order to database.',
                color: 'red'
            });
        }
    }, [numericId, refetch, showNotification]);

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

    const handleDragStart = useCallback((index: number) => {
        setDraggedIndex(index);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
    }, [draggedIndex]);

    const handleDrop = useCallback(async (e: React.DragEvent, index: number) => {
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
    }, [draggedIndex, isCrossVault, crossVaultImages, imagesWithOrder, handleReorder, handleReorderCrossVault]);

    const dragAndDrop = useMemo(() => ({
        draggedIndex,
        onDragStart: handleDragStart,
        onDragOver: handleDragOver,
        onDrop: handleDrop,
    }), [draggedIndex, handleDragStart, handleDragOver, handleDrop]);

    return {
        playlist,
        isLoading,
        error,
        refetch,
        isCrossVault,
        crossVaultImages,
        imagesWithOrder,
        imagesOnly,
        totalItemCount,
        dragAndDrop,
        handleMove,
        handleRemoveImage,
        handleRemoveCrossVaultImage,
        handleTriggerRandomPreview,
    };
}
