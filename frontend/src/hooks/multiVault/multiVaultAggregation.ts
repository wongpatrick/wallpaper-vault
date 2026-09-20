/**
 * @file
 * Pure aggregation utilities for merging datasets from multiple vaults.
 */
import type { LibraryStats, TagCount } from '../../api/model';
import { decorateWithVault } from './fetchFromVault';
import { sortItems } from './multiVaultSort';
import type { MultiVaultPage, Sortable, VaultEntry, WithMultiVault } from './types';

export const DEFAULT_CLOUD_LIMIT = 50;

/**
 * Merges paginated responses from multiple vaults, sorting items globally and returning a requested page slice.
 */
export function mergePaginatedResults<T extends Sortable>(
    responses: Array<{ data: { items?: T[]; total?: number; skip?: number; limit?: number }; vault: VaultEntry }>,
    sortBy?: string,
    sortDir: 'asc' | 'desc' = 'desc',
    skip = 0,
    limit = 12
): MultiVaultPage<T> {
    let total = 0;
    const allDecorated: WithMultiVault<T>[] = [];

    for (const res of responses) {
        total += res.data.total || 0;
        for (const item of res.data.items || []) {
            allDecorated.push(decorateWithVault(item, res.vault));
        }
    }

    const sorted = sortItems(allDecorated, sortBy, sortDir);
    const sliced = sorted.slice(skip, skip + limit);

    return {
        items: sliced,
        total,
        skip,
        limit
    };
}

/**
 * Merges dashboard stats across multiple vaults by summing counts and aggregating distributions.
 */
export function mergeDashboardStats(
    statsList: Array<{ stats: LibraryStats; vault: VaultEntry }>
): LibraryStats {
    const aggregated: LibraryStats = {
        total_images: 0,
        total_sets: 0,
        total_creators: 0,
        total_size_bytes: 0,
        database_size_bytes: 0,
        aspect_ratio_distribution: {}
    };

    for (const { stats } of statsList) {
        if (!stats) continue;
        aggregated.total_images += stats.total_images || 0;
        aggregated.total_sets += stats.total_sets || 0;
        aggregated.total_creators += stats.total_creators || 0;
        aggregated.total_size_bytes += stats.total_size_bytes || 0;
        aggregated.database_size_bytes += stats.database_size_bytes || 0;

        if (stats.aspect_ratio_distribution) {
            for (const [ratio, count] of Object.entries(stats.aspect_ratio_distribution)) {
                aggregated.aspect_ratio_distribution[ratio] =
                    (aggregated.aspect_ratio_distribution[ratio] || 0) + (Number(count) || 0);
            }
        }
    }

    return aggregated;
}

/**
 * Merges tag cloud items and sums occurrences by tag name and type.
 */
export function mergeTagCloudItems(
    tagLists: TagCount[][],
    limit = DEFAULT_CLOUD_LIMIT
): TagCount[] {
    const map = new Map<string, TagCount>();

    for (const list of tagLists) {
        for (const item of list || []) {
            const key = `${(item.tag || '').toLowerCase()}:${item.type || 'tag'}`;
            const existing = map.get(key);
            if (existing) {
                existing.count += item.count || 0;
            } else {
                map.set(key, { ...item, count: item.count || 0 });
            }
        }
    }

    const merged = Array.from(map.values()).sort((a, b) => b.count - a.count);
    return limit > 0 ? merged.slice(0, limit) : merged;
}

/**
 * Merges taxonomy entities (characters, franchises) deduplicating by name and combining counts.
 */
export function mergeTaxonomyItems<T extends { name: string; image_count?: number; set_count?: number }>(
    successful: Array<{ data: { items?: T[]; total?: number } }>,
    limit = DEFAULT_CLOUD_LIMIT
): { items: T[]; total: number } {
    const map = new Map<string, T>();
    let totalCount = 0;

    for (const res of successful) {
        if (res.data?.items && Array.isArray(res.data.items)) {
            totalCount += res.data.total || 0;
            for (const item of res.data.items) {
                const key = item.name.toLowerCase();
                const existing = map.get(key);
                if (existing) {
                    existing.image_count = (existing.image_count || 0) + (item.image_count || 0);
                    existing.set_count = (existing.set_count || 0) + (item.set_count || 0);
                } else {
                    map.set(key, { ...item });
                }
            }
        }
    }

    const merged = Array.from(map.values()).sort(
        (a, b) => ((b.image_count || 0) + (b.set_count || 0)) - ((a.image_count || 0) + (a.set_count || 0))
    );
    const items = limit > 0 ? merged.slice(0, limit) : merged;
    return { items, total: totalCount };
}
