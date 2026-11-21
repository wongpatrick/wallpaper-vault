/**
 * @file
 * Hook for scanning and resolving image duplicate groups by perceptual hash.
 * Supports exact match and configurable bitwise distance threshold for near-duplicate detection.
 */
import { useState, useEffect, useMemo } from 'react';
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
    const [maxDistance, setMaxDistance] = useState<number>(0);
    const [ignoredGroupIds, setIgnoredGroupIds] = useState<Set<string>>(new Set());

    const { 
        data: rawGroups, 
        isLoading, 
        isError, 
        refetch 
    } = useReadDuplicateGroupsApiImagesDuplicatesGroupsGet({
        max_distance: maxDistance
    });
    
    const resolveMutation = useResolveDuplicatesApiImagesDuplicatesResolvePost();

    const [resolving, setResolving] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'columns'>('grid');
    const [page, setPage] = useState(1);
    
    // Filter out groups dismissed in this session
    const groups = useMemo(() => {
        if (!rawGroups) return [];
        return rawGroups.filter(g => !ignoredGroupIds.has(g.group_id || g.phash));
    }, [rawGroups, ignoredGroupIds]);

    const totalPages = groups ? Math.ceil(groups.length / ITEMS_PER_PAGE) : 0;

    useEffect(() => {
        setPage(1);
    }, [maxDistance]);

    useEffect(() => {
        if (groups && page > totalPages && totalPages > 0) {
            setPage(totalPages);
        }
    }, [groups, page, totalPages]);

    const handleDismissGroup = (groupId: string) => {
        setIgnoredGroupIds(prev => new Set([...prev, groupId]));
        showNotification({
            title: 'Group Dismissed',
            message: 'Images kept and hidden from the current audit view.',
            color: 'blue',
            icon: <IconCheck size={16} />
        });
    };

    const handleResolve = async (group: DuplicateGroup, keepId: number) => {
        const removeIds = group.images
            .map(img => img.id)
            .filter(id => id !== keepId);

        const groupKey = group.group_id || group.phash;
        setResolving(groupKey);
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
        rawCount: rawGroups?.length || 0,
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
        maxDistance,
        setMaxDistance,
        handleDismissGroup,
        handleResolve
    };
}
