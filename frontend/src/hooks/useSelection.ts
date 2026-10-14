/**
 * @file useSelection hook
 */
import { useState, useCallback } from 'react';

interface SelectionState<T> {
    selectionMode: boolean;
    selectedIds: Set<T>;
}

export function useSelection<T = number>() {
    const [state, setState] = useState<SelectionState<T>>({
        selectionMode: false,
        selectedIds: new Set(),
    });

    const enterSelectionMode = useCallback(() => {
        setState(prev => (prev.selectionMode ? prev : { ...prev, selectionMode: true }));
    }, []);

    const exitSelectionMode = useCallback(() => {
        setState({
            selectionMode: false,
            selectedIds: new Set(),
        });
    }, []);

    const toggle = useCallback((id: T) => {
        setState(prev => {
            const next = new Set(prev.selectedIds);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return {
                selectionMode: next.size > 0,
                selectedIds: next,
            };
        });
    }, []);

    const selectAll = useCallback((allIds: T[]) => {
        setState(prev => {
            const next = new Set(prev.selectedIds);
            allIds.forEach(id => next.add(id));
            return {
                selectionMode: next.size > 0 ? true : prev.selectionMode,
                selectedIds: next,
            };
        });
    }, []);

    const clear = useCallback(() => {
        setState({
            selectionMode: false,
            selectedIds: new Set(),
        });
    }, []);

    const startSelectionWith = useCallback((id: T) => {
        setState({
            selectionMode: true,
            selectedIds: new Set([id]),
        });
    }, []);

    return {
        selectionMode: state.selectionMode,
        enterSelectionMode,
        exitSelectionMode,
        selectedIds: state.selectedIds,
        toggle,
        selectAll,
        clear,
        startSelectionWith
    };
}
