/**
 * @file
 * Module: Creator Mutations Hook
 * Description: Manages mutations, deletion confirmation modals, merge prompts, and update workflows for CreatorDetail.
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { Text } from '@mantine/core';
import { 
    useUpdateCreatorApiCreatorsCreatorIdPatch,
    useDeleteCreatorApiCreatorsCreatorIdDelete,
    useMergeCreatorsApiCreatorsMergePost,
    getReadCreatorsApiCreatorsGetQueryKey,
    getReadCreatorApiCreatorsCreatorIdGetQueryKey
} from '../../../api/generated/creators/creators';
import { useDeleteSetApiSetsSetIdDelete, getReadSetsApiSetsGetQueryKey } from '../../../api/generated/sets/sets';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import type { CreatorWithSets } from '../../../api/model';
import type { CreatorEditFormData } from '../CreatorEditModal';

const HTTP_STATUS_CONFLICT = 409;

export function useCreatorMutations(
    creatorId: string | undefined,
    creator: CreatorWithSets | undefined,
    refetch: () => void
) {
    const { showNotification } = useAppNotifications();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const updateMutation = useUpdateCreatorApiCreatorsCreatorIdPatch();
    const deleteMutation = useDeleteCreatorApiCreatorsCreatorIdDelete();
    const deleteSetMutation = useDeleteSetApiSetsSetIdDelete();
    const mergeMutation = useMergeCreatorsApiCreatorsMergePost();

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [mergePrompt, setMergePrompt] = useState<{ show: boolean; targetId: number | null; conflictingName?: string }>({ 
        show: false, 
        targetId: null 
    });

    const handleDeleteSet = useCallback((setId: number) => {
        const targetSet = creator?.sets?.find(s => s.id === setId);
        modals.openConfirmModal({
            title: 'Delete Set',
            centered: true,
            children: (
                <Text size="sm">
                    Are you sure you want to delete the set <b>"{targetSet?.title || `Set #${setId}`}"</b> ({targetSet?.images?.length || 0} images)? This will permanently remove all images in this set from your computer. This action cannot be undone.
                </Text>
            ),
            labels: { confirm: 'Delete permanently', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    await deleteSetMutation.mutateAsync({ setId });
                    showNotification({
                        title: 'Set deleted',
                        message: 'The set has been removed from your library.',
                        color: 'blue',
                    });
                    queryClient.invalidateQueries({ queryKey: getReadSetsApiSetsGetQueryKey() });
                    refetch();
                } catch (err) {
                    const axiosError = err as { response?: { data?: { detail?: string } } };
                    const message = axiosError.response?.data?.detail || 'Could not delete the set.';
                    showNotification({
                        title: 'Error',
                        message: typeof message === 'string' ? message : 'Could not delete the set.',
                        color: 'red',
                        autoClose: 10000
                    });
                }
            },
        });
    }, [creator, deleteSetMutation, queryClient, refetch, showNotification]);

    const handleUpdate = useCallback(async (formData: CreatorEditFormData) => {
        try {
            await updateMutation.mutateAsync({ 
                creatorId: Number(creatorId), 
                data: formData 
            });
            showNotification({ title: 'Success', message: 'Creator updated', color: 'green' });
            setIsEditModalOpen(false);
            queryClient.invalidateQueries({ queryKey: getReadCreatorsApiCreatorsGetQueryKey() });
            refetch();
        } catch (error: unknown) {
            const err = error as { response?: { status?: number, data?: { detail?: Record<string, unknown> | string } } };
            const detail = err.response?.data?.detail;
            
            if (err.response?.status === HTTP_STATUS_CONFLICT && detail && typeof detail === 'object' && 'conflicting_id' in detail) {
                setMergePrompt({ 
                    show: true, 
                    targetId: detail.conflicting_id as number,
                    conflictingName: formData.canonical_name 
                });
                setIsEditModalOpen(false);
                return;
            }

            const message = typeof detail === 'string' ? detail : ((detail?.message as string) || 'Could not update creator');
            showNotification({ title: 'Error', message, color: 'red' });
        }
    }, [creatorId, updateMutation, showNotification, queryClient, refetch]);

    const handleMergeConfirm = useCallback(async () => {
        if (mergePrompt.targetId === null || mergePrompt.targetId === undefined) return;
        try {
            await mergeMutation.mutateAsync({
                data: {
                    source_ids: [Number(creatorId)],
                    target_id: mergePrompt.targetId
                }
            });
            showNotification({ title: 'Success', message: 'Creators merged successfully', color: 'green' });
            setMergePrompt({ show: false, targetId: null });
            queryClient.invalidateQueries({ queryKey: getReadCreatorsApiCreatorsGetQueryKey() });
            queryClient.invalidateQueries({ queryKey: getReadCreatorApiCreatorsCreatorIdGetQueryKey(mergePrompt.targetId) });
            navigate(`/creators/${mergePrompt.targetId}`);
        } catch {
            showNotification({ title: 'Error', message: 'Could not merge creators', color: 'red' });
        }
    }, [mergePrompt.targetId, mergeMutation, creatorId, showNotification, queryClient, navigate]);

    const confirmDelete = useCallback(async () => {
        try {
            await deleteMutation.mutateAsync({ creatorId: Number(creatorId) });
            showNotification({ title: 'Creator deleted', message: 'Creator removed from database', color: 'blue' });
            setIsDeleteModalOpen(false);
            queryClient.invalidateQueries({ queryKey: getReadCreatorsApiCreatorsGetQueryKey() });
            navigate('/creators');
        } catch {
            showNotification({ title: 'Error', message: 'Could not delete creator', color: 'red' });
        }
    }, [deleteMutation, creatorId, showNotification, queryClient, navigate]);

    return {
        updateMutation,
        deleteMutation,
        isEditModalOpen,
        setIsEditModalOpen,
        isDeleteModalOpen,
        setIsDeleteModalOpen,
        mergePrompt,
        setMergePrompt,
        handleDeleteSet,
        handleUpdate,
        handleMergeConfirm,
        confirmDelete
    };
}
