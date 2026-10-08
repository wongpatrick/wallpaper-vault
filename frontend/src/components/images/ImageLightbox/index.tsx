/**
 * @file
 * Module: ImageLightbox Component
 * Description: Orchestrator for full-screen image viewer, coordinating header, image viewer, sidebar, filmstrip, and keyboard navigation.
 */
import { useMemo, useEffect, useState, useCallback } from 'react';
import { Modal, Box, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useNavigate, useLocation } from 'react-router-dom';
import { getImageUrl } from '../../../utils/fileUtils';
import { getLabelFromPath } from '../../../utils/navigationUtils';
import { useDeleteImage } from '../../../hooks/useDeleteImage';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import { useVault } from '../../../hooks/useVault';
import type { Image as ImageModel } from '../../../api/model';
import type { WithMultiVault } from '../../../types/vault';
import { ImageRating } from '../../../types/enums';

import { LightboxHeader } from './LightboxHeader';
import { LightboxSidebar } from './LightboxSidebar';
import { LightboxFilmstrip } from './LightboxFilmstrip';
import { LightboxImageViewer } from './LightboxImageViewer';
import { useLightboxShortcuts } from './useLightboxShortcuts';

export interface ImageLightboxProps {
    images: WithMultiVault<ImageModel>[];
    selectedIndex: number | null;
    onClose: () => void;
    onSelectIndex: (index: number) => void;
    onEdit: (image: ImageModel) => void;
    onDelete?: (imageId: number) => void;
    onUpdated?: () => void;
    totalCount?: number;
    disableActions?: boolean;
    onCrop?: (image: ImageModel) => void;
    onSetWallpaper?: (image: ImageModel) => void;
}

export function ImageLightbox({
    images,
    selectedIndex,
    onClose,
    onSelectIndex,
    onEdit,
    onDelete,
    onUpdated,
    totalCount,
    disableActions,
    onCrop,
    onSetWallpaper
}: ImageLightboxProps) {
    const { showNotification } = useAppNotifications();
    const { isAggregated, switchVault } = useVault();
    const { deleteImage, isDeleting } = useDeleteImage();
    const navigate = useNavigate();
    const location = useLocation();

    // Sidebar state (persist collapsed/expanded state in localStorage)
    const [sidebarOpen, setSidebarOpen] = useState(() => {
        const saved = localStorage.getItem('lightbox_sidebar_open');
        return saved !== null ? saved === 'true' : true;
    });

    const toggleSidebar = useCallback(() => {
        setSidebarOpen(prev => {
            const next = !prev;
            localStorage.setItem('lightbox_sidebar_open', String(next));
            return next;
        });
    }, []);

    const currentImage = selectedIndex !== null ? images[selectedIndex] : null;

    // Close lightbox if the index becomes invalid (e.g. after deletion or list reload)
    useEffect(() => {
        if (selectedIndex !== null && (!images || images.length === 0 || selectedIndex >= images.length)) {
            onClose();
        }
    }, [selectedIndex, images, onClose]);

    // Prefetch adjacent full-res images for instant navigation
    useEffect(() => {
        if (selectedIndex === null || !images || selectedIndex >= images.length) return;

        const prefetchIndices = [selectedIndex - 1, selectedIndex + 1];
        prefetchIndices.forEach(idx => {
            if (idx >= 0 && idx < images.length) {
                const img = new window.Image();
                img.src = getImageUrl(images[idx].id, images[idx].phash || images[idx].file_size || undefined);
            }
        });
    }, [selectedIndex, images]);

    const handlePrev = useCallback(() => {
        if (selectedIndex !== null && selectedIndex > 0) {
            onSelectIndex(selectedIndex - 1);
        }
    }, [selectedIndex, onSelectIndex]);

    const handleNext = useCallback(() => {
        if (selectedIndex !== null && selectedIndex < images.length - 1) {
            onSelectIndex(selectedIndex + 1);
        }
    }, [selectedIndex, images.length, onSelectIndex]);

    const handleDelete = useCallback(() => {
        if (!currentImage || selectedIndex === null) return;
        const deletedId = currentImage.id;
        const currentIndex = selectedIndex;
        const currentLength = images.length;

        modals.openConfirmModal({
            title: 'Delete Image',
            centered: true,
            children: (
                <Text size="sm">
                    Are you sure you want to delete this image? This will permanently remove the file from your computer.
                </Text>
            ),
            labels: { confirm: 'Delete permanently', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    await deleteImage(currentImage);
                    showNotification({ title: 'Image deleted', message: 'The image has been permanently removed.', color: 'blue' });
                    if (onDelete) {
                        onDelete(deletedId);
                    } else {
                        onUpdated?.();
                    }

                    if (currentLength <= 1) {
                        onClose();
                    } else if (currentIndex >= currentLength - 1) {
                        onSelectIndex(currentIndex - 1);
                    }
                } catch {
                    showNotification({ title: 'Error', message: 'Could not delete image', color: 'red' });
                }
            },
        });
    }, [currentImage, selectedIndex, images.length, deleteImage, showNotification, onDelete, onUpdated, onClose, onSelectIndex]);

    const navigateToSet = useCallback(async () => {
        if (currentImage?.set_id) {
            onClose();
            const multiImage = currentImage as WithMultiVault<ImageModel>;
            if (isAggregated && multiImage._vaultId) {
                await switchVault(multiImage._vaultId);
            }
            navigate(`/sets/${currentImage.set_id}`, {
                state: {
                    from: location.pathname,
                    fromLabel: getLabelFromPath(location.pathname)
                }
            });
        }
    }, [currentImage, onClose, isAggregated, switchVault, navigate, location.pathname]);

    // Keyboard shortcuts integration
    useLightboxShortcuts({
        enabled: selectedIndex !== null && !!currentImage,
        onPrev: handlePrev,
        onNext: handleNext,
        onClose,
        onToggleSidebar: toggleSidebar,
        onEdit: currentImage ? () => onEdit(currentImage) : undefined,
        onDelete: handleDelete,
        canGoPrev: selectedIndex !== null && selectedIndex > 0,
        canGoNext: selectedIndex !== null && selectedIndex < images.length - 1,
        disableActions
    });

    const rating = currentImage?.rating || ImageRating.SAFE;
    const borderColor = useMemo(() => {
        if (rating === ImageRating.EXPLICIT) return 'var(--mantine-color-red-filled)';
        if (rating === ImageRating.QUESTIONABLE) return 'var(--mantine-color-yellow-filled)';
        return 'transparent';
    }, [rating]);

    if (selectedIndex === null || !currentImage) return null;

    return (
        <Modal
            opened={selectedIndex !== null}
            onClose={onClose}
            fullScreen
            trapFocus={false}
            padding={0}
            withCloseButton={false}
            styles={{
                content: { backgroundColor: 'rgba(0,0,0,0.95)' },
                body: { height: '100%', padding: 0 }
            }}
        >
            <Box style={{ height: '100vh', width: '100vw', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <LightboxHeader
                    image={currentImage}
                    isAggregated={isAggregated}
                    sidebarOpen={sidebarOpen}
                    disableActions={disableActions}
                    isDeleting={isDeleting}
                    onClose={onClose}
                    onEdit={onEdit}
                    onCrop={onCrop}
                    onDelete={handleDelete}
                    onSetWallpaper={onSetWallpaper}
                    onToggleSidebar={toggleSidebar}
                    onNavigateToSet={currentImage.set_id ? navigateToSet : undefined}
                />

                {/* Content Area (Image + Sidebar) */}
                <Box style={{ flex: 1, display: 'flex', minHeight: 0, width: '100%', position: 'relative' }}>
                    <LightboxImageViewer
                        currentImage={currentImage}
                        borderColor={borderColor}
                        selectedIndex={selectedIndex}
                        totalImages={images.length}
                        sidebarOpen={sidebarOpen}
                        onPrev={handlePrev}
                        onNext={handleNext}
                    />

                    <LightboxSidebar
                        currentImage={currentImage}
                        opened={sidebarOpen}
                        onUpdated={onUpdated}
                    />
                </Box>

                {/* Filmstrip Thumbnail Navigation */}
                <LightboxFilmstrip
                    images={images}
                    selectedIndex={selectedIndex}
                    totalCount={totalCount}
                    onSelectIndex={onSelectIndex}
                />
            </Box>
        </Modal>
    );
}

export { LightboxHeader } from './LightboxHeader';
export { LightboxSidebar } from './LightboxSidebar';
export { LightboxFilmstrip } from './LightboxFilmstrip';
export { LightboxImageViewer } from './LightboxImageViewer';
