/**
 * @file
 * Module: Set Modals Hook
 * Description: Manages modal open/close states and active image targets for the SetDetail page.
 */
import { useState, useCallback } from 'react';
import type { Image as ImageModel } from '../../../api/model';

export type ActiveSetModal = 'editSet' | 'bulkEdit' | 'move' | 'addToPlaylist' | null;

export function useSetModals() {
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [activeModal, setActiveModal] = useState<ActiveSetModal>(null);
    const [editingImage, setEditingImage] = useState<ImageModel | null>(null);
    const [croppingImage, setCroppingImage] = useState<ImageModel | null>(null);
    const [movingSingleImage, setMovingSingleImage] = useState<ImageModel | null>(null);
    const [wallpaperImage, setWallpaperImage] = useState<ImageModel | null>(null);

    const handleImageClick = useCallback((index: number) => {
        setSelectedImageIndex(index);
    }, []);

    const handleSetWallpaper = useCallback((img: ImageModel) => {
        setWallpaperImage(img);
    }, []);

    const openModal = useCallback((modal: ActiveSetModal) => {
        setActiveModal(modal);
    }, []);

    const closeModal = useCallback(() => {
        setActiveModal(null);
    }, []);

    const closeMoveModal = useCallback(() => {
        setActiveModal(null);
        setMovingSingleImage(null);
    }, []);

    return {
        selectedImageIndex,
        setSelectedImageIndex,
        activeModal,
        setActiveModal,
        openModal,
        closeModal,
        editingImage,
        setEditingImage,
        croppingImage,
        setCroppingImage,
        movingSingleImage,
        setMovingSingleImage,
        wallpaperImage,
        setWallpaperImage,
        handleImageClick,
        handleSetWallpaper,
        closeMoveModal
    };
}
