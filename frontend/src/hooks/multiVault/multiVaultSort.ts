/**
 * @file
 * Sorting utilities for polymorphic entities aggregated across multiple vaults.
 */
import type { Sortable } from './types';

/**
 * Resolves a property value for sorting across polymorphic models.
 */
export function getSortValue(item: Sortable | null | undefined, sortBy?: string): string | number {
    if (!sortBy || !item) return '';
    const record = item as Record<string, unknown>;

    if (sortBy === 'name') {
        const canonicalName = typeof record.canonical_name === 'string' ? record.canonical_name : undefined;
        const name = typeof record.name === 'string' ? record.name : undefined;
        const title = typeof record.title === 'string' ? record.title : undefined;
        return canonicalName || name || title || '';
    }
    if (sortBy === 'image_count') {
        const imageListCount = Array.isArray(record.images) ? record.images.length : undefined;
        const imageCount = typeof record.image_count === 'number' ? record.image_count : undefined;
        return imageListCount ?? imageCount ?? 0;
    }
    if (sortBy === 'set_count') {
        const stats = record.stats as { total_sets?: number } | undefined;
        const statsSetCount = typeof stats?.total_sets === 'number' ? stats.total_sets : undefined;
        const setCount = typeof record.set_count === 'number' ? record.set_count : undefined;
        return statsSetCount ?? setCount ?? 0;
    }
    if (sortBy === 'total_image_count') {
        const stats = record.stats as { total_images?: number } | undefined;
        const statsImageCount = typeof stats?.total_images === 'number' ? stats.total_images : undefined;
        const totalImageCount = typeof record.total_image_count === 'number' ? record.total_image_count : undefined;
        return statsImageCount ?? totalImageCount ?? 0;
    }

    const val = record[sortBy];
    if (typeof val === 'string' || typeof val === 'number') {
        return val;
    }
    return '';
}

/**
 * Sorts items based on a property name and direction without mutating the input array.
 */
export function sortItems<T extends Sortable>(
    items: T[],
    sortBy?: string,
    sortDir: 'asc' | 'desc' = 'desc'
): T[] {
    if (!sortBy) return items;

    return [...items].sort((a, b) => {
        const valA = getSortValue(a, sortBy);
        const valB = getSortValue(b, sortBy);

        if (typeof valA === 'string' && typeof valB === 'string') {
            const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
            return sortDir === 'asc' ? cmp : -cmp;
        }

        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });
}
