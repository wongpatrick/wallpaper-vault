/**
 * @file
 * Module: Set Mutations Hook
 * Description: Encapsulates API mutations (delete, resync, auto-tag, bulk edit) and action handlers for SetDetail.
 */
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { Text, Alert } from '@mantine/core';
import { 
    useDeleteSetApiSetsSetIdDelete,
    useResyncSetApiSetsSetIdResyncPost,
    useAutoTagSetApiSetsSetIdAutoTagPost,
    getReadSetApiSetsSetIdGetQueryKey
} from '../../../api/generated/sets/sets';
import { useBulkUpdateImagesApiImagesBulkUpdatePost } from '../../../api/generated/images/images';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import type { Set as SetModel, BulkOperationMode, ImageUpdate } from '../../../api/model';

export interface UseSetMutationsOptions {
    set: SetModel | undefined;
    setId: string | undefined;
    refetch: () => void;
    selectedImageIds: Set<number>;
    clearSelection: () => void;
    closeModal: () => void;
    setMovingSingleImage: (img: null) => void;
}

export function useSetMutations({
    set,
    setId,
    refetch,
    selectedImageIds,
    clearSelection,
    closeModal,
    setMovingSingleImage
}: UseSetMutationsOptions) {
    const { showNotification } = useAppNotifications();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();

    const deleteMutation = useDeleteSetApiSetsSetIdDelete();
    const resyncMutation = useResyncSetApiSetsSetIdResyncPost();
    const autoTagMutation = useAutoTagSetApiSetsSetIdAutoTagPost();
    const bulkUpdateMutation = useBulkUpdateImagesApiImagesBulkUpdatePost();

    const handleDelete = () => {
        modals.openConfirmModal({
            title: 'Delete Set',
            centered: true,
            children: (
                <Alert color="red" title="Warning">
                    <Text size="sm">
                        Are you sure you want to delete the set <b>"{set?.title}"</b> ({set?.images?.length || 0} images)? This will permanently remove all images in this set from your computer. This action cannot be undone.
                    </Text>
                </Alert>
            ),
            labels: { confirm: 'Delete permanently', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    await deleteMutation.mutateAsync({ setId: Number(setId) });
                    queryClient.invalidateQueries({
                        predicate: (query) => {
                            const key0 = query.queryKey[0];
                            const key1 = query.queryKey[1];
                            return key0 === 'sets' || key0 === '/api/sets/' ||
                                (key0 === 'multi-vault' && (key1 === 'sets' || key1 === '/api/sets/'));
                        }
                    });
                    queryClient.removeQueries({
                        queryKey: getReadSetApiSetsSetIdGetQueryKey(Number(setId))
                    });
                    showNotification({ title: 'Set deleted', message: 'Set removed from vault', color: 'blue' });
                    if (location.state?.from) {
                        navigate(-1);
                    } else {
                        navigate('/sets');
                    }
                } catch (err) {
                    const axiosError = err as { response?: { data?: { detail?: string } } };
                    const message = axiosError.response?.data?.detail || 'Could not delete set';
                    showNotification({
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
            showNotification({ title: 'Error', message: 'No local path recorded.', color: 'red' });
            return;
        }
        if (!window.electron?.openPath) {
            showNotification({
                title: 'Browser Mode',
                message: 'Opening local folders is only supported in the desktop application.',
                color: 'yellow'
            });
            return;
        }
        try {
            const result = await window.electron.openPath(set.local_path);
            if (result && result.error) {
                showNotification({ title: 'Folder not found', message: result.error, color: 'red' });
            }
        } catch {
            showNotification({ title: 'Native Error', message: 'Could not open folder.', color: 'red' });
        }
    };

    const handleResync = async () => {
        try {
            await resyncMutation.mutateAsync({ setId: Number(setId) });
            showNotification({
                title: 'Resync Complete',
                message: 'Successfully synced database with folder contents.',
                color: 'green',
            });
            refetch();
        } catch (err) {
            console.error('Resync failed:', err);
            showNotification({
                title: 'Resync Failed',
                message: 'Could not sync folder. Ensure the path is correct and accessible.',
                color: 'red',
            });
        }
    };

    const handleAutoTag = async () => {
        try {
            await autoTagMutation.mutateAsync({ setId: Number(setId) });
            showNotification({
                title: 'Auto-Tagging Started',
                message: 'AI auto-tagging task queued for this set.',
                color: 'blue'
            });
        } catch (err) {
            console.error('Auto tagging failed:', err);
            showNotification({
                title: 'Error',
                message: 'Failed to start AI auto-tagging.',
                color: 'red',
            });
        }
    };

    const handleBulkEditConfirm = async (data: Partial<ImageUpdate>, mode: BulkOperationMode) => {
        try {
            await bulkUpdateMutation.mutateAsync({
                data: {
                    image_ids: Array.from(selectedImageIds),
                    update_data: data,
                    operation_mode: mode
                }
            });
            showNotification({
                title: 'Success',
                message: `Successfully updated ${selectedImageIds.size} images.`,
                color: 'green',
            });
            closeModal();
            clearSelection();
            refetch();
        } catch (err) {
            console.error('Bulk update failed:', err);
            showNotification({
                title: 'Error',
                message: 'Failed to update images in bulk.',
                color: 'red',
            });
        }
    };

    const handleMoveSuccess = () => {
        clearSelection();
        setMovingSingleImage(null);
        closeModal();
        refetch();
    };

    return {
        handleDelete,
        handleOpenFolder,
        handleResync,
        handleAutoTag,
        handleBulkEditConfirm,
        handleMoveSuccess,
        resyncPending: resyncMutation.isPending,
        autoTagPending: autoTagMutation.isPending,
        bulkUpdatePending: bulkUpdateMutation.isPending
    };
}
