/**
 * @file
 * Module: Set Filters Hook
 * Description: Manages URL query parameters for search, character, franchise, creator type, and sort state for the Sets directory page.
 */
import { useSearchParams } from 'react-router-dom';

export function useSetFilters(clearSelection: () => void) {
    const [searchParams, setSearchParams] = useSearchParams();

    const view = searchParams.get('view') || 'card';
    const typeFilter = searchParams.get('type') || null;
    const characterFilter = searchParams.get('character') || undefined;
    const franchiseFilter = searchParams.get('franchise') || undefined;
    const sortBy = searchParams.get('sort_by') || 'date_added';
    const sortDir = (searchParams.get('sort_dir') as 'asc' | 'desc') || 'desc';

    const handleViewChange = (val: string) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (val === 'card') next.delete('view');
            else next.set('view', val);
            return next;
        }, { replace: true });
    };

    const handleTypeChange = (val: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (!val) next.delete('type');
            else next.set('type', val);
            next.delete('page');
            return next;
        }, { replace: true });
        clearSelection();
    };

    const handleCharacterChange = (val: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (val) next.set('character', val);
            else next.delete('character');
            next.delete('page');
            return next;
        }, { replace: true });
        clearSelection();
    };

    const handleFranchiseChange = (val: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (val) next.set('franchise', val);
            else next.delete('franchise');
            next.delete('page');
            return next;
        }, { replace: true });
        clearSelection();
    };

    return {
        view,
        typeFilter,
        characterFilter,
        franchiseFilter,
        sortBy,
        sortDir,
        handleViewChange,
        handleTypeChange,
        handleCharacterChange,
        handleFranchiseChange
    };
}
