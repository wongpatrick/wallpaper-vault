/**
 * @file
 * Module: useGalleryBulkEdit hook
 * Description: Manages bulk updating and notifications for selected wallpapers.
 */
import { useBulkUpdateImagesApiImagesBulkUpdatePost } from '../../../api/generated/images/images';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import type { BulkOperationMode, ImageUpdate } from '../../../api/model';

interface UseGalleryBulkEditOptions {
    selectedImageIds: Set<number>;
    clearSelection: () => void;
    isAggregated?: boolean;
    onSuccess: () => void;
    onCloseModal: () => void;
}

export function useGalleryBulkEdit({
    selectedImageIds,
    clearSelection,
    isAggregated,
    onSuccess,
    onCloseModal,
}: UseGalleryBulkEditOptions) {
    const { showNotification } = useAppNotifications();
    const bulkUpdateMutation = useBulkUpdateImagesApiImagesBulkUpdatePost();

    const handleBulkEditConfirm = async (data: Partial<ImageUpdate>, mode: BulkOperationMode) => {
        if (isAggregated) {
            showNotification({
                title: 'Operation Not Supported',
                message: 'Bulk editing across multiple vaults is not supported. Please switch to a specific vault first.',
                color: 'yellow',
            });
            return;
        }

        try {
            await bulkUpdateMutation.mutateAsync({
                data: {
                    image_ids: Array.from(selectedImageIds),
                    update_data: data,
                    operation_mode: mode,
                },
            });
            showNotification({
                title: 'Success',
                message: `Successfully updated ${selectedImageIds.size} images.`,
                color: 'green',
            });
            onCloseModal();
            clearSelection();
            onSuccess();
        } catch (err) {
            console.error('Bulk update failed:', err);
            showNotification({
                title: 'Error',
                message: 'Failed to update images in bulk.',
                color: 'red',
            });
        }
    };

    return {
        handleBulkEditConfirm,
        isPending: bulkUpdateMutation.isPending,
    };
}
