/**
 * @file
 * Module: Set Bulk Operations
 * Description: Encapsulates bulk edits and deletion for multiple sets.
 */
import { useState } from 'react';
import { Button } from '@mantine/core';
import { IconGitMerge, IconUserEdit, IconTag, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { FloatingSelectionBar } from '../ui/FloatingSelectionBar';
import { SetBulkEditModal } from './SetBulkEditModal';
import { MergeSetsModal } from './MergeSetsModal';
import { 
    useBulkUpdateSetsApiSetsBulkUpdatePost, 
    useBulkDeleteSetsApiSetsBulkDeletePost, 
    useMergeSetsApiSetsMergePost 
} from '../../api/generated/sets/sets';
import type { SetUpdate, BulkOperationMode, Set as SetModel } from '../../api/model';

interface SetBulkOperationsProps {
    selectedIds: Set<number>;
    clearSelection: () => void;
    selectionMode: boolean;
    refetch: () => void;
    selectedSets: SetModel[];
}

export function SetBulkOperations({ 
    selectedIds, 
    clearSelection, 
    selectionMode, 
    refetch, 
    selectedSets 
}: SetBulkOperationsProps) {
    const [modalType, setModalType] = useState<'artist' | 'tags' | 'delete' | null>(null);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

    const bulkUpdateMutation = useBulkUpdateSetsApiSetsBulkUpdatePost();
    const bulkDeleteMutation = useBulkDeleteSetsApiSetsBulkDeletePost();
    const mergeMutation = useMergeSetsApiSetsMergePost();

    const handleBulkConfirm = async (data: SetUpdate, mode: BulkOperationMode) => {
        const ids = Array.from(selectedIds);
        try {
            if (modalType === 'delete') {
                await bulkDeleteMutation.mutateAsync({ data: ids });
                notifications.show({
                    title: 'Success',
                    message: `Successfully deleted ${ids.length} sets.`,
                    color: 'blue',
                });
            } else {
                await bulkUpdateMutation.mutateAsync({
                    data: {
                        set_ids: ids,
                        update_data: data,
                        operation_mode: mode
                    }
                });
                notifications.show({
                    title: 'Success',
                    message: `Successfully updated ${ids.length} sets.`,
                    color: 'blue',
                });
            }
            setModalType(null);
            clearSelection();
            refetch();
        } catch (err) {
            console.error('Bulk operation failed:', err);
            const axiosError = err as { response?: { data?: { detail?: string } } };
            const message = axiosError.response?.data?.detail || 'Bulk operation failed. Please try again.';
            notifications.show({
                title: 'Error',
                message: typeof message === 'string' ? message : 'Bulk operation failed. Please try again.',
                color: 'red',
                autoClose: 10000
            });
        }
    };

    const handleMergeConfirm = async (targetId: number) => {
        const sourceIds = Array.from(selectedIds).filter(id => id !== targetId);
        try {
            await mergeMutation.mutateAsync({
                data: {
                    source_ids: sourceIds,
                    target_id: targetId
                }
            });
            notifications.show({
                title: 'Merge Success',
                message: `Successfully merged ${sourceIds.length + 1} sets into one.`,
                color: 'green',
            });
            setIsMergeModalOpen(false);
            clearSelection();
            refetch();
        } catch (err) {
            console.error('Merge failed:', err);
            notifications.show({
                title: 'Merge Error',
                message: 'Failed to merge sets. Check if files are in use or on different drives.',
                color: 'red',
            });
        }
    };

    return (
        <>
            <FloatingSelectionBar 
                mounted={selectionMode && selectedIds.size > 0} 
                selectedCount={selectedIds.size} 
                onClear={clearSelection}
                itemLabel="items"
                minWidth={400}
            >
                {selectedIds.size >= 2 && (
                    <Button 
                        size="xs" 
                        variant="light" 
                        color="green"
                        leftSection={<IconGitMerge size={14} />} 
                        radius="xl"
                        onClick={() => setIsMergeModalOpen(true)}
                    >
                        Merge
                    </Button>
                )}
                <Button 
                    size="xs" 
                    variant="light" 
                    leftSection={<IconUserEdit size={14} />} 
                    radius="xl"
                    onClick={() => setModalType('artist')}
                >
                    Artist
                </Button>
                <Button 
                    size="xs" 
                    variant="light" 
                    leftSection={<IconTag size={14} />} 
                    radius="xl"
                    onClick={() => setModalType('tags')}
                >
                    Tags
                </Button>
                <Button 
                    size="xs" 
                    variant="light" 
                    color="red" 
                    leftSection={<IconTrash size={14} />} 
                    radius="xl"
                    onClick={() => setModalType('delete')}
                >
                    Delete
                </Button>
            </FloatingSelectionBar>

            <SetBulkEditModal 
                key={modalType || 'none'}
                opened={modalType !== null}
                onClose={() => setModalType(null)}
                type={modalType || 'artist'}
                selectedCount={selectedIds.size}
                onConfirm={handleBulkConfirm}
                loading={bulkUpdateMutation.isPending || bulkDeleteMutation.isPending}
                selectedSets={selectedSets}
            />

            <MergeSetsModal 
                opened={isMergeModalOpen}
                onClose={() => setIsMergeModalOpen(false)}
                selectedSets={selectedSets}
                onConfirm={handleMergeConfirm}
                loading={mergeMutation.isPending}
            />
        </>
    );
}
