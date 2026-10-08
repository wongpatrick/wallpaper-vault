/**
 * @file
 * Module: Set Detail Modals Component
 * Description: Renders all modal and lightbox dialogs for the SetDetail page.
 */
import { lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImageLightbox } from '../../../components/images/ImageLightbox';
import { SetAsWallpaperModal } from '../../../components/images/SetAsWallpaperModal';
import { ImageEditModal } from '../../../components/images/ImageEditModal';
import { ImageMoveModal } from '../../../components/images/ImageMoveModal';
import { ImageBulkEditModal } from '../../../components/images/ImageBulkEditModal';
import { AddToPlaylistModal } from '../../../components/playlists/AddToPlaylistModal';
import { EditSetModal } from './EditSetModal';
import { getReadSetApiSetsSetIdGetQueryKey } from '../../../api/generated/sets/sets';
import type { Set as SetModel, ImageUpdate, BulkOperationMode } from '../../../api/model';
import type { useSetModals } from '../hooks/useSetModals';

const ImageCropModal = lazy(() => import('../../../components/images/ImageCropModal').then(m => ({ default: m.ImageCropModal })));

export interface SetDetailModalsProps {
    set: SetModel;
    setId: string | undefined;
    modals: ReturnType<typeof useSetModals>;
    bulkUpdatePending: boolean;
    onBulkEditConfirm: (data: Partial<ImageUpdate>, mode: BulkOperationMode) => void;
    onMoveSuccess: () => void;
    selectedImageIds: Set<number>;
    clearSelection: () => void;
    refetch: () => void;
}

export function SetDetailModals({
    set,
    setId,
    modals,
    bulkUpdatePending,
    onBulkEditConfirm,
    onMoveSuccess,
    selectedImageIds,
    clearSelection,
    refetch
}: SetDetailModalsProps) {
    const queryClient = useQueryClient();

    const handleOptimisticImageDelete = (deletedId: number) => {
        const queryKey = getReadSetApiSetsSetIdGetQueryKey(Number(setId));
        queryClient.setQueryData<SetModel>(queryKey, (old) => {
            if (!old?.images) return old;
            return { ...old, images: old.images.filter(img => img.id !== deletedId) };
        });
        refetch();
    };

    return (
        <>
            {/* Lightbox for full size preview */}
            {modals.selectedImageIndex !== null && set.images && (
                <ImageLightbox 
                    images={set.images}
                    selectedIndex={modals.selectedImageIndex}
                    onClose={() => modals.setSelectedImageIndex(null)}
                    onSelectIndex={(idx) => modals.setSelectedImageIndex(idx)}
                    onEdit={(img) => modals.setEditingImage(img)}
                    onCrop={(img) => modals.setCroppingImage(img)}
                    onDelete={handleOptimisticImageDelete}
                    onUpdated={refetch}
                    onSetWallpaper={(img) => modals.setWallpaperImage(img)}
                />
            )}

            <SetAsWallpaperModal
                opened={modals.wallpaperImage !== null}
                onClose={() => modals.setWallpaperImage(null)}
                image={modals.wallpaperImage}
            />

            {/* Edit Image Modal */}
            {modals.editingImage && (
                <ImageEditModal 
                    image={modals.editingImage}
                    opened={!!modals.editingImage}
                    onClose={() => modals.setEditingImage(null)}
                    onUpdated={() => {
                        modals.setEditingImage(null);
                        refetch();
                    }}
                    onDelete={(deletedId) => {
                        modals.setEditingImage(null);
                        modals.setSelectedImageIndex(null);
                        handleOptimisticImageDelete(deletedId);
                    }}
                />
            )}

            {/* Crop Image Modal */}
            {modals.croppingImage && (
                <Suspense fallback={null}>
                    <ImageCropModal 
                        image={modals.croppingImage}
                        opened={!!modals.croppingImage}
                        onClose={() => modals.setCroppingImage(null)}
                        onCropSuccess={() => {
                            modals.setCroppingImage(null);
                            refetch();
                        }}
                    />
                </Suspense>
            )}

            {/* Move Image Modal */}
            <ImageMoveModal 
                selectedImageIds={modals.movingSingleImage ? [modals.movingSingleImage.id] : Array.from(selectedImageIds)}
                opened={modals.activeModal === 'move' || !!modals.movingSingleImage}
                onClose={modals.closeMoveModal}
                onSuccess={onMoveSuccess}
            />

            {/* Bulk Edit Modal */}
            <ImageBulkEditModal 
                opened={modals.activeModal === 'bulkEdit'}
                onClose={modals.closeModal}
                selectedCount={selectedImageIds.size}
                onConfirm={onBulkEditConfirm}
                loading={bulkUpdatePending}
            />

            {/* Add to Playlist Modal */}
            <AddToPlaylistModal 
                opened={modals.activeModal === 'addToPlaylist'}
                onClose={modals.closeModal}
                imageIds={Array.from(selectedImageIds)}
                onSuccess={() => {
                    clearSelection();
                    refetch();
                }}
            />

            {/* Edit Set Modal */}
            <EditSetModal 
                opened={modals.activeModal === 'editSet'} 
                onClose={modals.closeModal} 
                set={set}
                onSuccess={refetch}
            />
        </>
    );
}
