/**
 * @file
 * Hook for scanning and resolving image duplicate groups by perceptual hash.
 */
import { useState, useEffect } from 'react';
import { IconCheck, IconAlertCircle } from '@tabler/icons-react';
import {
    useReadDuplicateGroupsApiImagesDuplicatesGroupsGet,
    useResolveDuplicatesApiImagesDuplicatesResolvePost
} from '../../../api/generated/images/images';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import type { DuplicateGroup } from '../../../api/model';

const ITEMS_PER_PAGE = 10;

export function useDuplicateScanner() {
    const { showNotification } = useAppNotifications();
    const { 
        data: groups, 
        isLoading, 
        isError, 
        refetch 
    } = useReadDuplicateGroupsApiImagesDuplicatesGroupsGet({});
    
    const resolveMutation = useResolveDuplicatesApiImagesDuplicatesResolvePost();

    const [resolving, setResolving] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'columns'>('grid');
    const [page, setPage] = useState(1);
    
    const totalPages = groups ? Math.ceil(groups.length / ITEMS_PER_PAGE) : 0;

    useEffect(() => {
        if (groups && page > totalPages && totalPages > 0) {
            setPage(totalPages);
        }
    }, [groups, page, totalPages]);

    const handleResolve = async (group: DuplicateGroup, keepId: number) => {
        const removeIds = group.images
            .map(img => img.id)
            .filter(id => id !== keepId);

        setResolving(group.phash);
        try {
            await resolveMutation.mutateAsync({
                data: {
                    keep_image_id: keepId,
                    remove_image_ids: removeIds
                }
            });
            showNotification({
                title: 'Success',
                message: `Resolved duplicate group. Removed ${removeIds.length} redundant images.`,
                color: 'green',
                icon: <IconCheck size={16} />
            });
            refetch();
        } catch {
            showNotification({
                title: 'Error',
                message: 'Failed to resolve duplicates.',
                color: 'red',
                icon: <IconAlertCircle size={16} />
            });
        } finally {
            setResolving(null);
        }
    };

    return {
        groups,
        isLoading,
        isError,
        refetch,
        resolving,
        viewMode,
        setViewMode,
        page,
        setPage,
        totalPages,
        ITEMS_PER_PAGE,
        handleResolve
    };
}
