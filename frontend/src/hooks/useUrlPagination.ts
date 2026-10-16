/**
 * @file useUrlPagination hook
 * Manages URL query parameter synchronization for pagination state.
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useUrlPagination(pageSize: number) {
    const [searchParams, setSearchParams] = useSearchParams();

    const raw = searchParams.get('page');
    const parsed = raw ? parseInt(raw, 10) : 1;
    const page = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;

    const setPage = useCallback((newPageOrFn: number | ((prev: number) => number)) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            const currentRaw = next.get('page');
            const currentParsed = currentRaw ? parseInt(currentRaw, 10) : 1;
            const currentPage = Number.isNaN(currentParsed) || currentParsed < 1 ? 1 : currentParsed;
            const computed = typeof newPageOrFn === 'function' ? newPageOrFn(currentPage) : newPageOrFn;
            const safeNewPage = Number.isNaN(computed) || computed <= 1 ? 1 : computed;

            if (safeNewPage <= 1) {
                next.delete('page');
            } else {
                next.set('page', safeNewPage.toString());
            }
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const getTotalPages = useCallback((totalCount: number) => {
        return Math.ceil(Math.max(0, totalCount) / pageSize);
    }, [pageSize]);

    return {
        page,
        setPage,
        getTotalPages,
        totalPages: getTotalPages,
        pageSize
    };
}
