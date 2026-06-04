import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@mantine/hooks';

export function useUrlSearch(debounceMs = 500) {
    const [searchParams, setSearchParams] = useSearchParams();
    
    // URL State (Source of Truth for API)
    const search = searchParams.get('search') || '';
    
    // Local Search State (Immediate UI feedback)
    const [localSearch, setLocalSearch] = useState(search);
    const [debouncedLocalSearch] = useDebouncedValue(localSearch, debounceMs);

    // Sync URL when local search is debounced
    useEffect(() => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            const currentUrlSearch = next.get('search') || '';
            
            if (debouncedLocalSearch !== currentUrlSearch) {
                if (!debouncedLocalSearch) next.delete('search');
                else next.set('search', debouncedLocalSearch);
                next.delete('page'); // Reset to page 1
            }
            return next;
        }, { replace: true });
    }, [debouncedLocalSearch, setSearchParams]);

    // Sync local search when URL changes (Back button)
    useEffect(() => {
        setLocalSearch(search);
    }, [search]);

    return { search, localSearch, setLocalSearch };
}
