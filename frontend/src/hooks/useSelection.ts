/**
 * @file useSelection hook
 */
import { useState, useCallback } from 'react';

export function useSelection<T = number>() {
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set());

    const toggle = useCallback((id: T) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
        setSelectionMode(true);
    }, []);

    const selectAll = useCallback((allIds: T[]) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            allIds.forEach(id => next.add(id));
            return next;
        });
        setSelectionMode(true);
    }, []);

    const clear = useCallback(() => {
        setSelectedIds(new Set());
        setSelectionMode(false);
    }, []);

    const startSelectionWith = useCallback((id: T) => {
        setSelectionMode(true);
        setSelectedIds(new Set([id]));
    }, []);

    return {
        selectionMode,
        setSelectionMode,
        selectedIds,
        toggle,
        selectAll,
        clear,
        startSelectionWith
    };
}
