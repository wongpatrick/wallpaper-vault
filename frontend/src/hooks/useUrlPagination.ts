/**
 * @file useUrlPagination hook
 */
import { useSearchParams } from 'react-router-dom';

export function useUrlPagination(pageSize: number) {
    const [searchParams, setSearchParams] = useSearchParams();
    
    const page = parseInt(searchParams.get('page') || '1', 10);

    const setPage = (newPage: number) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (newPage <= 1) next.delete('page');
            else next.set('page', newPage.toString());
            return next;
        }, { replace: true });
    };

    const totalPages = (totalCount: number) => Math.ceil(totalCount / pageSize);

    return { page, setPage, totalPages, pageSize };
}
