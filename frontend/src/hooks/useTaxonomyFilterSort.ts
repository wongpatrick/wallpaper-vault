/**
 * @file Filter and sort hook for taxonomy management.
 */
/* eslint-disable no-magic-numbers */
import { useState, useMemo } from 'react';

export function useTaxonomyFilterSort<T extends { name: string; set_count?: number; image_count?: number; franchise?: { name: string } | null }>(data: T[] | undefined) {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<string | null>('set_count_desc');
    const [page, setPage] = useState(1);
    const pageSize = 15;

    const filteredAndSorted = useMemo(() => {
        if (!data) return [];
        let filtered = data;
        
        if (search.trim()) {
            const s = search.toLowerCase();
            filtered = filtered.filter(item => item.name.toLowerCase().includes(s));
        }

        return [...filtered].sort((a, b) => {
            if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
            if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
            if (sortBy === 'set_count_desc') return (b.set_count || 0) - (a.set_count || 0);
            if (sortBy === 'set_count_asc') return (a.set_count || 0) - (b.set_count || 0);
            if (sortBy === 'image_count_desc') return (b.image_count || 0) - (a.image_count || 0);
            if (sortBy === 'image_count_asc') return (a.image_count || 0) - (b.image_count || 0);
            if (sortBy === 'franchise_asc') {
                const fa = a.franchise?.name || '';
                const fb = b.franchise?.name || '';
                return fa.localeCompare(fb);
            }
            if (sortBy === 'franchise_desc') {
                const fa = a.franchise?.name || '';
                const fb = b.franchise?.name || '';
                return fb.localeCompare(fa);
            }
            return 0;
        });
    }, [data, search, sortBy]);

    const totalPages = Math.ceil(filteredAndSorted.length / pageSize);
    const paginatedResult = filteredAndSorted.slice((page - 1) * pageSize, page * pageSize);

    const handleSearchChange = (val: string) => {
        setSearch(val);
        setPage(1);
    };

    const handleSortChange = (val: string | null) => {
        setSortBy(val);
        setPage(1);
    };

    return { 
        search, 
        setSearch: handleSearchChange, 
        sortBy, 
        setSortBy: handleSortChange, 
        page, 
        setPage, 
        totalPages,
        totalItems: filteredAndSorted.length,
        result: paginatedResult 
    };
}
