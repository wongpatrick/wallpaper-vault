/**
 * @file
 * Hook and utilities for parallel cross-vault data queries in Aggregated Mode.
 * Handles parallel network requests, graceful partial failure handling, item metadata decoration,
 * result merging, global sorting, and client-side pagination.
 */
import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { useVault } from './useVault';
import { AXIOS_INSTANCE } from '../api/axios-instance';
import type { VaultEntry } from '../types/electron';
import type { WithMultiVault } from '../types/vault';
import type {
    SetPage,
    SetSummary,
    ImagePage,
    Image,
    CreatorPage,
    Creator,
    DashboardData,
    LibraryStats,
    TagCount,
    Character,
    Franchise
} from '../api/model';

const DEFAULT_CLOUD_LIMIT = 50;

export type MultiVaultPage<T extends object> = {
    items: WithMultiVault<T>[];
    total: number;
    skip?: number;
    limit?: number;
};

export interface MultiVaultQueryResult<T> {
    data: T | undefined;
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
    refetch: () => Promise<unknown>;
    isAggregated: boolean;
    onlineCount: number;
    totalVaultsCount: number;
    offlineVaults: VaultEntry[];
}

/**
 * Executes a GET request against a specific vault endpoint.
 */
export async function fetchFromVault<T>(
    vault: VaultEntry,
    endpoint: string,
    params?: Record<string, unknown>,
    signal?: AbortSignal
): Promise<T> {
    const cleanBaseUrl = vault.url.replace(/\/+$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${cleanBaseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
        'X-API-Key': vault.apiKey || ''
    };

    const response = await AXIOS_INSTANCE.get<T>(url, {
        headers,
        params,
        signal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ skipAuthInterceptor: true } as any)
    });

    return response.data;
}

/**
 * Decorates an item or list of items with origin vault metadata.
 */
export function decorateWithVault<T extends object>(item: T, vault: VaultEntry): WithMultiVault<T> {
    return {
        ...item,
        _vaultId: vault.id,
        _vaultLabel: vault.label,
        _vaultUrl: vault.url,
        _vaultApiKey: vault.apiKey
    };
}

/**
 * Resolves a property value for sorting across polymorphic models.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSortValue(item: any, sortBy?: string): string | number {
    if (!sortBy || !item) return '';
    if (sortBy === 'name') return item.canonical_name || item.name || item.title || '';
    if (sortBy === 'image_count') return item.images?.length ?? item.image_count ?? 0;
    if (sortBy === 'set_count') return item.stats?.total_sets ?? item.set_count ?? 0;
    if (sortBy === 'total_image_count') return item.stats?.total_images ?? item.total_image_count ?? 0;
    return item[sortBy] ?? '';
}

/**
 * Helper to sort items based on a property name and direction.
 */
export function sortItems<T>(items: T[], sortBy?: string, sortDir: 'asc' | 'desc' = 'desc'): T[] {
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

/**
 * Merges paginated responses from multiple vaults.
 */
export function mergePaginatedResults<T extends object>(
    responses: Array<{ data: { items?: T[]; total: number; skip?: number; limit?: number }; vault: VaultEntry }>,
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
 * Merges dashboard stats across multiple vaults.
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
 * Merges tag cloud items and sums occurrences by name.
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
 * Generic query factory for multi-vault data retrieval.
 */
export interface MultiVaultQueryConfig<TParams, TResponse, TMerged> {
    resource: string | string[];
    fetchFn: (vault: VaultEntry, params: TParams, signal?: AbortSignal) => Promise<TResponse>;
    mergeFn: (
        responses: Array<{ data: TResponse; vault: VaultEntry }>,
        params: TParams
    ) => TMerged;
    transformSingle?: (response: TResponse, vault: VaultEntry, params: TParams) => TMerged;
    getAggregatedParams?: (params: TParams) => TParams;
}

export function createMultiVaultQuery<
    TParams = Record<string, unknown>,
    TResponse = unknown,
    TMerged = TResponse
>(config: MultiVaultQueryConfig<TParams, TResponse, TMerged>) {
    return function useCreatedMultiVaultQuery(
        params: TParams = {} as TParams,
        options?: Partial<UseQueryOptions<TMerged, Error>>
    ): MultiVaultQueryResult<TMerged> {
        const { vaults, onlineVaults, activeVault, isAggregated } = useVault();
        const offlineVaults = vaults.filter(v => !v.isLocal && v.status !== 'online');

        const resourceKey = Array.isArray(config.resource) ? config.resource : [config.resource];
        const queryKey = [
            'multi-vault',
            ...resourceKey,
            isAggregated,
            isAggregated ? onlineVaults.map(v => v.id) : activeVault.id,
            params
        ];

        const query = useQuery<TMerged, Error>({
            queryKey,
            queryFn: async ({ signal }) => {
                if (!isAggregated) {
                    const raw = await config.fetchFn(activeVault, params, signal);
                    if (config.transformSingle) {
                        return config.transformSingle(raw, activeVault, params);
                    }
                    return raw as unknown as TMerged;
                }

                const vaultParams = config.getAggregatedParams ? config.getAggregatedParams(params) : params;
                const settled = await Promise.allSettled(
                    onlineVaults.map(async vault => {
                        const data = await config.fetchFn(vault, vaultParams, signal);
                        return { data, vault };
                    })
                );

                const successful: Array<{ data: TResponse; vault: VaultEntry }> = [];
                for (const res of settled) {
                    if (res.status === 'fulfilled' && res.value?.data) {
                        successful.push(res.value);
                    }
                }

                return config.mergeFn(successful, params);
            },
            ...options
        });

        return {
            data: query.data,
            isLoading: query.isLoading,
            isFetching: query.isFetching,
            error: query.error,
            refetch: query.refetch,
            isAggregated,
            onlineCount: onlineVaults.length,
            totalVaultsCount: vaults.length,
            offlineVaults
        };
    };
}

// ---------------------------------------------------------------------------
// Paginated Resource Query Factory Helper
// ---------------------------------------------------------------------------
function createPaginatedMultiVaultQuery<
    TItem extends object,
    TPage extends { items?: TItem[]; total?: number; skip?: number; limit?: number }
>(resource: string, endpoint: string, defaultLimit: number, defaultSort: string, defaultDir: 'asc' | 'desc') {
    return createMultiVaultQuery<Record<string, unknown>, TPage, MultiVaultPage<TItem>>({
        resource,
        fetchFn: (vault, params, signal) => fetchFromVault<TPage>(vault, endpoint, params, signal),
        transformSingle: (res, vault) => ({
            items: (res.items || []).map(item => decorateWithVault(item, vault)),
            total: res.total || 0,
            skip: res.skip,
            limit: res.limit
        }),
        getAggregatedParams: (params) => {
            const skip = Number(params.skip) || 0;
            const limit = Number(params.limit) || defaultLimit;
            return { ...params, skip: 0, limit: skip + limit };
        },
        mergeFn: (successful, params) => {
            const skip = Number(params.skip) || 0;
            const limit = Number(params.limit) || defaultLimit;
            const sortBy = (params.sort_by as string) || defaultSort;
            const sortDir = ((params.sort_dir as string) || defaultDir) as 'asc' | 'desc';
            return mergePaginatedResults<TItem>(
                successful as Array<{ data: { items?: TItem[]; total: number; skip?: number; limit?: number }; vault: VaultEntry }>,
                sortBy,
                sortDir,
                skip,
                limit
            );
        }
    });
}

/** Hook for fetching Sets with Multi-Vault support. */
export const useMultiVaultSets = createPaginatedMultiVaultQuery<SetSummary, SetPage>(
    'sets',
    '/api/sets/',
    12,
    'date_added',
    'desc'
);

/** Hook for fetching Images with Multi-Vault support. */
export const useMultiVaultImages = createPaginatedMultiVaultQuery<Image, ImagePage>(
    'images',
    '/api/images/',
    100,
    'date_added',
    'desc'
);

/** Hook for fetching Creators with Multi-Vault support. */
export const useMultiVaultCreators = createPaginatedMultiVaultQuery<Creator, CreatorPage>(
    'creators',
    '/api/creators/',
    12,
    'name',
    'asc'
);

/** Hook for fetching Dashboard data with Multi-Vault support. */
export const useMultiVaultDashboard = createMultiVaultQuery<
    void | undefined,
    DashboardData,
    DashboardData
>({
    resource: 'dashboard',
    fetchFn: (vault, _params, signal) => fetchFromVault<DashboardData>(vault, '/api/dashboard/', undefined, signal),
    mergeFn: (successful) => {
        const statsList: Array<{ stats: LibraryStats; vault: VaultEntry }> = [];
        const allAlerts: DashboardData['health_alerts'] = [];

        for (const res of successful) {
            if (res.data?.stats) {
                statsList.push({ stats: res.data.stats, vault: res.vault });
            }
            if (res.data?.health_alerts) {
                allAlerts.push(...res.data.health_alerts);
            }
        }

        return {
            stats: mergeDashboardStats(statsList),
            health_alerts: allAlerts
        };
    }
});

/** Hook for fetching Tag Cloud items with Multi-Vault support. */
export const useMultiVaultTagCloud = createMultiVaultQuery<
    { limit?: number; scope?: string },
    TagCount[],
    TagCount[]
>({
    resource: ['tags', 'cloud'],
    fetchFn: (vault, params, signal) => fetchFromVault<TagCount[]>(vault, '/api/tags/cloud', params, signal),
    mergeFn: (successful, params) => {
        const tagLists = successful.map(s => s.data).filter(Boolean);
        const limit = params.limit ?? DEFAULT_CLOUD_LIMIT;
        return mergeTagCloudItems(tagLists, limit);
    }
});

// ---------------------------------------------------------------------------
// Taxonomy Entity Merger Helper (Characters & Franchises)
// ---------------------------------------------------------------------------
function mergeTaxonomyItems<T extends { name: string; image_count?: number; set_count?: number }>(
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
                if (map.has(key)) {
                    const existing = map.get(key)!;
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

type TaxonomyQueryParams = { limit?: number; scope?: string; search?: string; sort_by?: string; sort_dir?: string };

/** Hook for fetching Characters with Multi-Vault support. */
export const useMultiVaultCharacters = createMultiVaultQuery<
    TaxonomyQueryParams,
    { items: Character[]; total: number },
    { items: Character[]; total: number }
>({
    resource: 'characters',
    fetchFn: (vault, params, signal) => fetchFromVault<{ items: Character[]; total: number }>(vault, '/api/characters/', params, signal),
    mergeFn: (successful, params) => mergeTaxonomyItems(successful, params.limit ?? DEFAULT_CLOUD_LIMIT)
});

/** Hook for fetching Franchises with Multi-Vault support. */
export const useMultiVaultFranchises = createMultiVaultQuery<
    TaxonomyQueryParams,
    { items: Franchise[]; total: number },
    { items: Franchise[]; total: number }
>({
    resource: 'franchises',
    fetchFn: (vault, params, signal) => fetchFromVault<{ items: Franchise[]; total: number }>(vault, '/api/franchises/', params, signal),
    mergeFn: (successful, params) => mergeTaxonomyItems(successful, params.limit ?? DEFAULT_CLOUD_LIMIT)
});

/** Hook for fetching a random inspiration image with Multi-Vault support. */
export function useMultiVaultRandomImage(
    params: { log_rotation?: boolean } = {},
    options?: Partial<UseQueryOptions<Image, Error>>
): MultiVaultQueryResult<Image> {
    const { vaults, onlineVaults, activeVault, isAggregated } = useVault();
    const offlineVaults = vaults.filter(v => !v.isLocal && v.status !== 'online');

    const queryKey = ['multi-vault', 'random-image', isAggregated, isAggregated ? onlineVaults.map(v => v.id) : activeVault.id, params];

    const query = useQuery<Image, Error>({
        queryKey,
        queryFn: async ({ signal }) => {
            if (!isAggregated || onlineVaults.length === 0) {
                const item = await fetchFromVault<Image>(activeVault, '/api/images/random', params, signal);
                return decorateWithVault(item, activeVault);
            }

            // Pick a random online vault
            const randomIndex = Math.floor(Math.random() * onlineVaults.length);
            const selectedVault = onlineVaults[randomIndex] || activeVault;

            try {
                const item = await fetchFromVault<Image>(selectedVault, '/api/images/random', params, signal);
                return decorateWithVault(item, selectedVault);
            } catch {
                // Fallback to active vault
                const fallbackItem = await fetchFromVault<Image>(activeVault, '/api/images/random', params, signal);
                return decorateWithVault(fallbackItem, activeVault);
            }
        },
        ...options
    });

    return {
        data: query.data,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
        isAggregated,
        onlineCount: onlineVaults.length,
        totalVaultsCount: vaults.length,
        offlineVaults
    };
}
