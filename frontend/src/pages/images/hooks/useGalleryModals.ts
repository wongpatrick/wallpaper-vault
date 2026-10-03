/**
 * @file
 * Module: Gallery Modals Hook
 * Description: Manages modal visibility states and active target images for the Images page.
 */
import { useState, useCallback } from 'react';
import type { Image as ImageModel } from '../../../api/model';

export function useGalleryModals() {
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [editingImage, setEditingImage] = useState<ImageModel | null>(null);
    const [croppingImage, setCroppingImage] = useState<ImageModel | null>(null);
    const [wallpaperImage, setWallpaperImage] = useState<ImageModel | null>(null);
    const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

    const handleImageClick = useCallback((originalIdx: number) => {
        setSelectedImageIndex(originalIdx);
    }, []);

    const handleSetWallpaper = useCallback((img: ImageModel) => {
        setWallpaperImage(img);
    }, []);

    const closeLightbox = useCallback(() => setSelectedImageIndex(null), []);
    const closeEditModal = useCallback(() => setEditingImage(null), []);
    const closeCropModal = useCallback(() => setCroppingImage(null), []);
    const closeWallpaperModal = useCallback(() => setWallpaperImage(null), []);
    const openBulkEdit = useCallback(() => setIsBulkEditOpen(true), []);
    const closeBulkEdit = useCallback(() => setIsBulkEditOpen(false), []);
    const openAddToPlaylist = useCallback(() => setIsAddToPlaylistOpen(true), []);
    const closeAddToPlaylist = useCallback(() => setIsAddToPlaylistOpen(false), []);

    return {
        selectedImageIndex,
        setSelectedImageIndex,
        editingImage,
        setEditingImage,
        croppingImage,
        setCroppingImage,
        wallpaperImage,
        setWallpaperImage,
        isAddToPlaylistOpen,
        setIsAddToPlaylistOpen,
        isBulkEditOpen,
        setIsBulkEditOpen,
        handleImageClick,
        handleSetWallpaper,
        closeLightbox,
        closeEditModal,
        closeCropModal,
        closeWallpaperModal,
        openBulkEdit,
        closeBulkEdit,
        openAddToPlaylist,
        closeAddToPlaylist
    };
}
