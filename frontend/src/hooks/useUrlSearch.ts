/**
 * @file useUrlSearch hook
 */
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@mantine/hooks';

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_RESET_PARAMS: readonly string[] = ['page'];

export function useUrlSearch(debounceMs = DEFAULT_DEBOUNCE_MS, resetParams: readonly string[] = DEFAULT_RESET_PARAMS) {
    const [searchParams, setSearchParams] = useSearchParams();
    
    // URL State (Source of Truth for API)
    const search = searchParams.get('search') || '';
    
    // Local Search State (Immediate UI feedback)
    const [localSearch, setLocalSearch] = useState(search);
    const [debouncedLocalSearch] = useDebouncedValue(localSearch, debounceMs);

    // Keep resetParams in a ref updated in useEffect
    const resetParamsRef = useRef(resetParams);
    useEffect(() => {
        resetParamsRef.current = resetParams;
    }, [resetParams]);

    // Sync URL when local search is debounced
    useEffect(() => {
        if (debouncedLocalSearch === search) {
            return;
        }

        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (!debouncedLocalSearch) {
                next.delete('search');
            } else {
                next.set('search', debouncedLocalSearch);
            }
            resetParamsRef.current.forEach(param => next.delete(param));
            return next;
        }, { replace: true });
    }, [debouncedLocalSearch, search, setSearchParams]);

    // Sync local search when URL changes (Back button)
    useEffect(() => {
        setLocalSearch(search);
    }, [search]);

    return { search, localSearch, setLocalSearch };
}
