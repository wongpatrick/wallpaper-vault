/**
 * @file Generic Taxonomy CRUD Hook
 */
/* eslint-disable no-magic-numbers */
import { useState } from 'react';
import { Text } from '@mantine/core';
import { modals } from '@mantine/modals';

export interface UseTaxonomyCRUDProps<T extends { id: number; name: string }> {
    items: T[] | undefined;
    sortedItems: T[];
    deleteEntity: (id: number) => Promise<void>;
    mergeEntities: (sourceIds: number[], targetId: number) => Promise<void>;
    bulkDeleteEntities: (ids: number[]) => Promise<void>;
    deleteTitle?: string;
    deleteMessage?: string;
}

export function useTaxonomyCRUD<T extends { id: number; name: string }>({
    sortedItems,
    deleteEntity,
    mergeEntities,
    bulkDeleteEntities,
    deleteTitle = 'Delete Item',
    deleteMessage = 'Are you sure you want to delete this item?'
}: UseTaxonomyCRUDProps<T>) {
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [mergeModalOpen, setMergeModalOpen] = useState(false);
    const [targetId, setTargetId] = useState<string | null>(null);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(sortedItems.map(item => item.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleDelete = (id: number) => {
        modals.openConfirmModal({
            title: deleteTitle,
            centered: true,
            children: <Text size="sm">{deleteMessage}</Text>,
            labels: { confirm: 'Delete', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                await deleteEntity(id);
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            },
        });
    };

    const handleMerge = async () => {
        if (!targetId || selectedIds.size < 2) return;
        const target = parseInt(targetId, 10);
        const sourceIds = Array.from(selectedIds).filter(id => id !== target);
        if (sourceIds.length === 0) return;

        await mergeEntities(sourceIds, target);
        setMergeModalOpen(false);
        setSelectedIds(new Set());
    };

    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return;
        modals.openConfirmModal({
            title: 'Delete Selected Items?',
            centered: true,
            children: (
                <Text size="sm">
                    Are you sure you want to permanently delete {selectedIds.size} selected items? This will remove links from all associated wallpapers and sets. This action cannot be undone.
                </Text>
            ),
            labels: { confirm: 'Delete Selected', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                await bulkDeleteEntities(Array.from(selectedIds));
                setSelectedIds(new Set());
            },
        });
    };

    const isAllSelected = sortedItems.length > 0 && selectedIds.size === sortedItems.length;
    const isIndeterminate = selectedIds.size > 0 && selectedIds.size < sortedItems.length;

    return {
        selectedIds,
        setSelectedIds,
        mergeModalOpen,
        setMergeModalOpen,
        targetId,
        setTargetId,
        handleSelectAll,
        toggleSelect,
        handleDelete,
        handleMerge,
        handleBulkDelete,
        isAllSelected,
        isIndeterminate
    };
}
