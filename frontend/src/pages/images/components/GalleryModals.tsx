/**
 * @file
 * Module: Gallery Modals Component
 * Description: Renders lightbox, wallpaper modal, single edit modal, crop modal, bulk edit modal, and add-to-playlist modal.
 */
import { lazy, Suspense } from 'react';
import { ImageLightbox } from '../../../components/images/ImageLightbox';
import { SetAsWallpaperModal } from '../../../components/images/SetAsWallpaperModal';
import { ImageEditModal } from '../../../components/images/ImageEditModal';
import { ImageBulkEditModal } from '../../../components/images/ImageBulkEditModal';
import { AddToPlaylistModal } from '../../../components/playlists/AddToPlaylistModal';
import type { Image as ImageModel, BulkOperationMode, ImageUpdate } from '../../../api/model';
import type { useGalleryModals } from '../hooks/useGalleryModals';

const ImageCropModal = lazy(() => import('../../../components/images/ImageCropModal').then(m => ({ default: m.ImageCropModal })));

export interface GalleryModalsProps {
    allImages: ImageModel[];
    modals: ReturnType<typeof useGalleryModals>;
    totalCount: number | undefined;
    selectedImageIds: Set<number>;
    clearSelection: () => void;
    handleCollectionReset: () => void;
    refetch: () => void;
    onDeleteImage: (deletedId: number) => void;
    onBulkEditConfirm: (data: Partial<ImageUpdate>, mode: BulkOperationMode) => void;
    bulkUpdatePending: boolean;
}

export function GalleryModals({
    allImages,
    modals,
    totalCount,
    selectedImageIds,
    clearSelection,
    handleCollectionReset,
    refetch,
    onDeleteImage,
    onBulkEditConfirm,
    bulkUpdatePending
}: GalleryModalsProps) {
    return (
        <>
            <ImageLightbox
                images={allImages}
                selectedIndex={modals.selectedImageIndex}
                onClose={modals.closeLightbox}
                onSelectIndex={modals.setSelectedImageIndex}
                onEdit={(img) => modals.setEditingImage(img)}
                totalCount={totalCount}
                onDelete={onDeleteImage}
                onUpdated={handleCollectionReset}
                onCrop={(img) => modals.setCroppingImage(img)}
                onSetWallpaper={(img) => modals.setWallpaperImage(img)}
            />

            <SetAsWallpaperModal
                opened={modals.wallpaperImage !== null}
                onClose={modals.closeWallpaperModal}
                image={modals.wallpaperImage}
            />

            <ImageEditModal
                image={modals.editingImage}
                opened={modals.editingImage !== null}
                onClose={modals.closeEditModal}
                onUpdated={() => {
                    modals.closeEditModal();
                    refetch();
                }}
                onDelete={(deletedId) => {
                    modals.closeEditModal();
                    modals.setSelectedImageIndex(null);
                    onDeleteImage(deletedId);
                }}
            />

            {modals.croppingImage && (
                <Suspense fallback={null}>
                    <ImageCropModal 
                        key={modals.croppingImage.id}
                        image={modals.croppingImage}
                        opened={!!modals.croppingImage}
                        onClose={modals.closeCropModal}
                        onCropSuccess={handleCollectionReset}
                    />
                </Suspense>
            )}

            <ImageBulkEditModal
                opened={modals.isBulkEditOpen}
                onClose={modals.closeBulkEdit}
                onConfirm={onBulkEditConfirm}
                loading={bulkUpdatePending}
                selectedCount={selectedImageIds.size}
            />

            <AddToPlaylistModal
                opened={modals.isAddToPlaylistOpen}
                onClose={modals.closeAddToPlaylist}
                imageIds={Array.from(selectedImageIds)}
                onSuccess={() => {
                    clearSelection();
                    refetch();
                }}
            />
        </>
    );
}
