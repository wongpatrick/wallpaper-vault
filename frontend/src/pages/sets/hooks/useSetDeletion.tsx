/**
 * @file
 * Module: Set Deletion Hook
 * Description: Manages deletion confirmation modal, multi-vault context switching, and API deletion for the Sets page.
 */
import { useCallback } from 'react';
import { modals } from '@mantine/modals';
import { Text } from '@mantine/core';
import { useDeleteSetApiSetsSetIdDelete } from '../../../api/generated/sets/sets';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import { useVault } from '../../../hooks/useVault';
import type { SetSummary as SetModel } from '../../../api/model';
import type { WithMultiVault } from '../../../types/vault';

export function useSetDeletion(sets: SetModel[], isAggregated: boolean, refetch: () => void) {
    const { showNotification } = useAppNotifications();
    const { activeVault, switchVault } = useVault();
    const deleteMutation = useDeleteSetApiSetsSetIdDelete();

    const handleDelete = useCallback((setId: number) => {
        const targetSet = sets.find(s => s.id === setId);
        modals.openConfirmModal({
            title: 'Delete Set',
            centered: true,
            children: (
                <Text size="sm">
                    Are you sure you want to delete the set <b>"{targetSet?.title || `Set #${setId}`}"</b> ({targetSet?.image_count ?? 0} images)? This will permanently remove all images in this set from your computer. This action cannot be undone.
                </Text>
            ),
            labels: { confirm: 'Delete permanently', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    const multiSet = targetSet as WithMultiVault<SetModel>;
                    if (isAggregated && multiSet?._vaultId && activeVault.id !== multiSet._vaultId) {
                        await switchVault(multiSet._vaultId);
                    }
                    await deleteMutation.mutateAsync({ setId });
                    showNotification({
                        title: 'Set deleted',
                        message: 'The set has been removed from your library.',
                        color: 'blue',
                    });
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
    }, [sets, isAggregated, activeVault.id, switchVault, deleteMutation, refetch, showNotification]);

    return { handleDelete };
}
