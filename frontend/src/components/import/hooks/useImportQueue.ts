/**
 * @file
 * Hook for managing the import queue items, selection states, and item overrides.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ImageValidationItem } from '../../../api/model';

export interface QueueItem extends ImageValidationItem {
    id: string;
    selected: boolean;
    filenameOverride: string;
    customTags: string[];
    customRating: string | null;
    objectUrl: string | null;
    isFolder: boolean;
}

interface UseImportQueueProps {
    opened: boolean;
}

export function useImportQueue({ opened }: UseImportQueueProps) {
    const [queue, setQueue] = useState<QueueItem[]>([]);

    useEffect(() => {
        if (!opened) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setQueue(prev => {
                prev.forEach(item => {
                    if (item.objectUrl) {
                        URL.revokeObjectURL(item.objectUrl);
                    }
                });
                return [];
            });
        }
    }, [opened]);

    const toggleItemSelect = useCallback((id: string) => {
        setQueue(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
    }, []);

    const toggleGroupSelect = useCallback((itemIds: string[], checked: boolean) => {
        const idSet = new Set(itemIds);
        setQueue(prev => prev.map(item => idSet.has(item.id) ? { ...item, selected: checked } : item));
    }, []);

    const updateItemFilename = useCallback((id: string, name: string) => {
        setQueue(prev => prev.map(item => item.id === id ? { ...item, filenameOverride: name } : item));
    }, []);

    const removeItem = useCallback((id: string) => {
        setQueue(prev => {
            const item = prev.find(i => i.id === id);
            if (item?.objectUrl) {
                URL.revokeObjectURL(item.objectUrl);
            }
            return prev.filter(i => i.id !== id);
        });
    }, []);

    const selectedQueueItems = useMemo(() => queue.filter(i => i.selected), [queue]);

    return {
        queue,
        setQueue,
        toggleItemSelect,
        toggleGroupSelect,
        updateItemFilename,
        removeItem,
        selectedQueueItems
    };
}
