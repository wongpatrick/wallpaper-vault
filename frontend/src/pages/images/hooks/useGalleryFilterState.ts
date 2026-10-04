/**
 * @file
 * Module: Gallery Filter State Hook
 * Description: Manages URL-driven search, rating, tag, color explorer, character, franchise, and sort filters for Images gallery.
 */
import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUrlSearch } from '../../../hooks/useUrlSearch';

const SEARCH_DEBOUNCE_MS = 500;
const COLOR_DEBOUNCE_MS = 500;
const DEFAULT_TOLERANCE = 30;

export function useGalleryFilterState(onFilterReset: () => void) {
    const [searchParams, setSearchParams] = useSearchParams();
    const { search, localSearch, setLocalSearch } = useUrlSearch(SEARCH_DEBOUNCE_MS);

    // URL State (Source of Truth for API)
    const ratingFilter = searchParams.get('rating') || 'all';
    const tagFilter = searchParams.get('tag') || undefined;
    const colorFilter = searchParams.get('color') || undefined;
    const colorTolerance = parseInt(searchParams.get('tolerance') || '30', 10);
    const characterFilter = searchParams.get('character') || undefined;
    const franchiseFilter = searchParams.get('franchise') || undefined;
    const sortBy = searchParams.get('sort_by') || 'date_added';
    const sortDir = (searchParams.get('sort_dir') as 'asc' | 'desc') || 'desc';
    const activeTab = searchParams.get('tab') || 'gallery';

    const handleTabChange = (value: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (value === 'gallery') next.delete('tab');
            else if (value) next.set('tab', value);
            return next;
        }, { replace: true });
    };

    // Unified helper to update search params and reset collection pagination
    const updateFilterParam = useCallback((key: string, value: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (value) next.set(key, value);
            else next.delete(key);
            next.delete('page');
            return next;
        }, { replace: true });
        onFilterReset();
    }, [setSearchParams, onFilterReset]);

    // Filter Handlers
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => setLocalSearch(e.currentTarget.value);
    const handleRatingChange = (val: string) => updateFilterParam('rating', val === 'all' ? null : val);
    const handleColorChange = useCallback((hex: string) => updateFilterParam('color', hex), [updateFilterParam]);
    const handleClearColor = () => updateFilterParam('color', null);
    const handleClearTag = () => updateFilterParam('tag', null);
    const handleCharacterChange = (val: string | null) => updateFilterParam('character', val);
    const handleFranchiseChange = (val: string | null) => updateFilterParam('franchise', val);
    const handleToleranceChange = useCallback((val: number) => {
        updateFilterParam('tolerance', val === DEFAULT_TOLERANCE ? null : val.toString());
    }, [updateFilterParam]);

    // Debounced color picker handler
    const colorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleColorPickerChange = useCallback((hex: string) => {
        if (colorDebounceRef.current) clearTimeout(colorDebounceRef.current);
        colorDebounceRef.current = setTimeout(() => handleColorChange(hex), COLOR_DEBOUNCE_MS);
    }, [handleColorChange]);

    return {
        search,
        localSearch,
        activeTab,
        ratingFilter,
        tagFilter,
        colorFilter,
        colorTolerance,
        characterFilter,
        franchiseFilter,
        sortBy,
        sortDir,
        handleTabChange,
        handleSearchChange,
        handleRatingChange,
        handleColorChange,
        handleClearColor,
        handleClearTag,
        handleCharacterChange,
        handleFranchiseChange,
        handleToleranceChange,
        handleColorPickerChange
    };
}
