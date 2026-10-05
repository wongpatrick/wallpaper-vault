/**
 * @file
 * Module: usePlaylistModals hook
 * Description: Manages modal visibility state for playlist lightbox, edit, rotation URL, and cross-vault image picker.
 */
import { useState, useCallback } from 'react';

export function usePlaylistModals() {
    const [lightboxImageIndex, setLightboxImageIndex] = useState<number | null>(null);
    const [rotationModalOpened, setRotationModalOpened] = useState(false);
    const [editModalOpened, setEditModalOpened] = useState(false);
    const [addVaultModalOpened, setAddVaultModalOpened] = useState(false);

    const openLightbox = useCallback((idx: number) => setLightboxImageIndex(idx), []);
    const closeLightbox = useCallback(() => setLightboxImageIndex(null), []);

    const openRotationModal = useCallback(() => setRotationModalOpened(true), []);
    const closeRotationModal = useCallback(() => setRotationModalOpened(false), []);

    const openEditModal = useCallback(() => setEditModalOpened(true), []);
    const closeEditModal = useCallback(() => setEditModalOpened(false), []);

    const openAddVaultModal = useCallback(() => setAddVaultModalOpened(true), []);
    const closeAddVaultModal = useCallback(() => setAddVaultModalOpened(false), []);

    return {
        lightboxImageIndex,
        setLightboxImageIndex,
        openLightbox,
        closeLightbox,
        rotationModalOpened,
        openRotationModal,
        closeRotationModal,
        editModalOpened,
        openEditModal,
        closeEditModal,
        addVaultModalOpened,
        openAddVaultModal,
        closeAddVaultModal,
    };
}
