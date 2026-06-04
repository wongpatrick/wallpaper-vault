/**
 * @file useSelection hook
 */
import { useState } from 'react';

export function useSelection<T = number>() {
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set());

    const toggle = (id: T) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
        if (next.size > 0) setSelectionMode(true);
    };

    const selectAll = (allIds: T[]) => {
        const next = new Set(selectedIds);
        allIds.forEach(id => next.add(id));
        setSelectedIds(next);
        setSelectionMode(true);
    };

    const clear = () => {
        setSelectedIds(new Set());
        setSelectionMode(false);
    };

    const startSelectionWith = (id: T) => {
        setSelectionMode(true);
        setSelectedIds(new Set([id]));
    };

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
