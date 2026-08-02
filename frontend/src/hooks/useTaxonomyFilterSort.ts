/**
 * @file Server-side filter and sort hook for taxonomy management.
 */
/* eslint-disable no-magic-numbers */
import { useState, useMemo, useEffect } from 'react';
import type { TaxonomyQueryParams } from '../api/taxonomy';

const DEBOUNCE_MS = 300;

export function useTaxonomyFilterSort(defaultPageSize: number = 25) {
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sortBy, setSortBy] = useState<string | null>('set_count_desc');
    const [page, setPage] = useState(1);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchInput);
            setPage(1);
        }, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const { sort_by, sort_dir } = useMemo(() => {
        if (!sortBy) return { sort_by: undefined, sort_dir: undefined };
        if (sortBy.endsWith('_asc')) {
            return { sort_by: sortBy.slice(0, -4), sort_dir: 'asc' };
        }
        if (sortBy.endsWith('_desc')) {
            return { sort_by: sortBy.slice(0, -5), sort_dir: 'desc' };
        }
        return { sort_by: sortBy, sort_dir: undefined };
    }, [sortBy]);

    const queryParams: TaxonomyQueryParams = useMemo(() => ({
        search: debouncedSearch.trim() || undefined,
        sort_by,
        sort_dir,
        skip: (page - 1) * defaultPageSize,
        limit: defaultPageSize,
    }), [debouncedSearch, sort_by, sort_dir, page, defaultPageSize]);

    const getTotalPages = (totalItems: number) => Math.max(1, Math.ceil(totalItems / defaultPageSize));

    const handleSearchChange = (val: string) => {
        setSearchInput(val);
    };

    const handleSortChange = (val: string | null) => {
        setSortBy(val);
        setPage(1);
    };

    return { 
        search: searchInput, 
        setSearch: handleSearchChange, 
        sortBy, 
        setSortBy: handleSortChange, 
        page, 
        setPage, 
        getTotalPages,
        queryParams
    };
}



