/**
 * @file
 * Module: Creator Sets Filter Hook
 * Description: Manages search query, orientation filters, sort criterion, and derived set items for CreatorDetail.
 */
import { useState, useMemo } from 'react';
import type { Set as SetModel } from '../../../api/model';
import { sortSets } from '../../../utils/comparators';

const SQUARE_RATIO_TOLERANCE = 0.05;

export function useCreatorSetsFilter(sets: SetModel[] | undefined) {
    const [searchQuery, setSearchQuery] = useState('');
    const [orientationFilter, setOrientationFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<string>('date_added_desc');

    const processedSets = useMemo(() => {
        if (!sets) return [];

        let result = [...sets];

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(set => {
                const titleMatch = set.title ? set.title.toLowerCase().includes(query) : false;
                const tagMatch = set.tags?.some(tag => tag.toLowerCase().includes(query));
                const charMatch = set.characters?.some(char => char.toLowerCase().includes(query));
                return titleMatch || tagMatch || charMatch;
            });
        }

        // Orientation filter
        if (orientationFilter !== 'all') {
            result = result.filter(set => {
                if (!set.images || set.images.length === 0) return false;
                return set.images.some(img => {
                    const ratio = img.aspect_ratio;
                    if (!ratio) return false;
                    if (orientationFilter === 'landscape') return ratio > 1.0;
                    if (orientationFilter === 'portrait') return ratio < 1.0;
                    if (orientationFilter === 'square') return Math.abs(ratio - 1.0) < SQUARE_RATIO_TOLERANCE;
                    return true;
                });
            });
        }

        // Sorting with lookup table and precomputed folder sizes
        return sortSets(result, sortBy);
    }, [sets, searchQuery, orientationFilter, sortBy]);

    return {
        searchQuery,
        setSearchQuery,
        orientationFilter,
        setOrientationFilter,
        sortBy,
        setSortBy,
        processedSets
    };
}
