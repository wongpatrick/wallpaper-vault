/**
 * @file
 * Module: Comparators Utility
 * Description: Reusable comparator lookup tables and sorting helpers for client-side collections.
 */

export function computeSetFolderSize(set: { images?: Array<{ file_size?: number | null }> }): number {
    return set.images?.reduce((sum, img) => sum + (img.file_size || 0), 0) || 0;
}

export interface SortableSetItem {
    title?: string | null;
    date_added: string;
    images?: Array<{ file_size?: number | null }>;
}

export type SetSortKey =
    | 'title_asc'
    | 'title_desc'
    | 'date_added_desc'
    | 'date_added_asc'
    | 'image_count_desc'
    | 'image_count_asc'
    | 'folder_size_desc'
    | 'folder_size_asc';

export type SetComparator<T extends SortableSetItem> = (
    a: T,
    b: T,
    folderSizeMap?: Map<T, number>
) => number;

export const SET_SORT_COMPARATORS: Record<SetSortKey, SetComparator<SortableSetItem>> = {
    title_asc: (a, b) => (a.title || '').localeCompare(b.title || ''),
    title_desc: (a, b) => (b.title || '').localeCompare(a.title || ''),
    date_added_desc: (a, b) => (b.date_added || '').localeCompare(a.date_added || ''),
    date_added_asc: (a, b) => (a.date_added || '').localeCompare(b.date_added || ''),
    image_count_desc: (a, b) => (b.images?.length || 0) - (a.images?.length || 0),
    image_count_asc: (a, b) => (a.images?.length || 0) - (b.images?.length || 0),
    folder_size_desc: (a, b, folderSizeMap) => {
        const sizeA = folderSizeMap?.get(a) ?? computeSetFolderSize(a);
        const sizeB = folderSizeMap?.get(b) ?? computeSetFolderSize(b);
        return sizeB - sizeA;
    },
    folder_size_asc: (a, b, folderSizeMap) => {
        const sizeA = folderSizeMap?.get(a) ?? computeSetFolderSize(a);
        const sizeB = folderSizeMap?.get(b) ?? computeSetFolderSize(b);
        return sizeA - sizeB;
    }
};

/**
 * Sorts an array of sets using the comparator lookup table with precomputed folder sizes.
 */
export function sortSets<T extends SortableSetItem>(items: T[], sortBy: string): T[] {
    const comparator = SET_SORT_COMPARATORS[sortBy as SetSortKey];
    if (!comparator) return items;

    let folderSizeMap: Map<T, number> | undefined;
    if (sortBy === 'folder_size_desc' || sortBy === 'folder_size_asc') {
        folderSizeMap = new Map();
        for (const item of items) {
            folderSizeMap.set(item, computeSetFolderSize(item));
        }
    }

    return [...items].sort((a, b) => comparator(a, b, folderSizeMap));
}
