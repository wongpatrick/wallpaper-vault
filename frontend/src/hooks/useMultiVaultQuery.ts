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
 * Hook for fetching Sets with Multi-Vault support.
 */
export function useMultiVaultSets(
    params: Record<string, unknown> = {},
    options?: Partial<UseQueryOptions<MultiVaultPage<SetSummary>, Error>>
): MultiVaultQueryResult<MultiVaultPage<SetSummary>> {
    const { vaults, onlineVaults, activeVault, isAggregated } = useVault();
    const offlineVaults = vaults.filter(v => !v.isLocal && v.status !== 'online');

    const skip = Number(params.skip) || 0;
    const limit = Number(params.limit) || 12;
    const sortBy = (params.sort_by as string) || 'date_added';
    const sortDir = ((params.sort_dir as string) || 'desc') as 'asc' | 'desc';

    const queryKey = ['multi-vault', 'sets', isAggregated, isAggregated ? onlineVaults.map(v => v.id) : activeVault.id, params];

    const query = useQuery<MultiVaultPage<SetSummary>, Error>({
        queryKey,
        queryFn: async ({ signal }) => {
            if (!isAggregated) {
                const res = await fetchFromVault<SetPage>(activeVault, '/api/sets/', params, signal);
                return {
                    items: (res.items || []).map(item => decorateWithVault(item, activeVault)),
                    total: res.total || 0,
                    skip: res.skip,
                    limit: res.limit
                };
            }

            // In Aggregated mode: query all online vaults in parallel
            // Fetch up to skip + limit from each vault so we can merge & slice accurately
            const fetchLimit = skip + limit;
            const vaultParams = { ...params, skip: 0, limit: fetchLimit };

            const settled = await Promise.allSettled(
                onlineVaults.map(async vault => {
                    const data = await fetchFromVault<SetPage>(vault, '/api/sets/', vaultParams, signal);
                    return { data, vault };
                })
            );

            const successful: Array<{ data: { items?: SetSummary[]; total: number; skip?: number; limit?: number }; vault: VaultEntry }> = [];
            for (const result of settled) {
                if (result.status === 'fulfilled' && result.value?.data) {
                    successful.push(result.value);
                }
            }

            return mergePaginatedResults<SetSummary>(successful, sortBy, sortDir, skip, limit);
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

/**
 * Hook for fetching Images with Multi-Vault support.
 */
export function useMultiVaultImages(
    params: Record<string, unknown> = {},
    options?: Partial<UseQueryOptions<MultiVaultPage<Image>, Error>>
): MultiVaultQueryResult<MultiVaultPage<Image>> {
    const { vaults, onlineVaults, activeVault, isAggregated } = useVault();
    const offlineVaults = vaults.filter(v => !v.isLocal && v.status !== 'online');

    const skip = Number(params.skip) || 0;
    const limit = Number(params.limit) || 100;
    const sortBy = (params.sort_by as string) || 'date_added';
    const sortDir = ((params.sort_dir as string) || 'desc') as 'asc' | 'desc';

    const queryKey = ['multi-vault', 'images', isAggregated, isAggregated ? onlineVaults.map(v => v.id) : activeVault.id, params];

    const query = useQuery<MultiVaultPage<Image>, Error>({
        queryKey,
        queryFn: async ({ signal }) => {
            if (!isAggregated) {
                const res = await fetchFromVault<ImagePage>(activeVault, '/api/images/', params, signal);
                return {
                    items: (res.items || []).map(item => decorateWithVault(item, activeVault)),
                    total: res.total || 0,
                    skip: res.skip,
                    limit: res.limit
                };
            }

            const fetchLimit = skip + limit;
            const vaultParams = { ...params, skip: 0, limit: fetchLimit };

            const settled = await Promise.allSettled(
                onlineVaults.map(async vault => {
                    const data = await fetchFromVault<ImagePage>(vault, '/api/images/', vaultParams, signal);
                    return { data, vault };
                })
            );

            const successful: Array<{ data: { items?: Image[]; total: number; skip?: number; limit?: number }; vault: VaultEntry }> = [];
            for (const result of settled) {
                if (result.status === 'fulfilled' && result.value?.data) {
                    successful.push(result.value);
                }
            }

            return mergePaginatedResults<Image>(successful, sortBy, sortDir, skip, limit);
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

/**
 * Hook for fetching Creators with Multi-Vault support.
 */
export function useMultiVaultCreators(
    params: Record<string, unknown> = {},
    options?: Partial<UseQueryOptions<MultiVaultPage<Creator>, Error>>
): MultiVaultQueryResult<MultiVaultPage<Creator>> {
    const { vaults, onlineVaults, activeVault, isAggregated } = useVault();
    const offlineVaults = vaults.filter(v => !v.isLocal && v.status !== 'online');

    const skip = Number(params.skip) || 0;
    const limit = Number(params.limit) || 12;
    const sortBy = (params.sort_by as string) || 'name';
    const sortDir = ((params.sort_dir as string) || 'asc') as 'asc' | 'desc';

    const queryKey = ['multi-vault', 'creators', isAggregated, isAggregated ? onlineVaults.map(v => v.id) : activeVault.id, params];

    const query = useQuery<MultiVaultPage<Creator>, Error>({
        queryKey,
        queryFn: async ({ signal }) => {
            if (!isAggregated) {
                const res = await fetchFromVault<CreatorPage>(activeVault, '/api/creators/', params, signal);
                return {
                    items: (res.items || []).map(item => decorateWithVault(item, activeVault)),
                    total: res.total || 0,
                    skip: res.skip,
                    limit: res.limit
                };
            }

            const fetchLimit = skip + limit;
            const vaultParams = { ...params, skip: 0, limit: fetchLimit };

            const settled = await Promise.allSettled(
                onlineVaults.map(async vault => {
                    const data = await fetchFromVault<CreatorPage>(vault, '/api/creators/', vaultParams, signal);
                    return { data, vault };
                })
            );

            const successful: Array<{ data: { items?: Creator[]; total: number; skip?: number; limit?: number }; vault: VaultEntry }> = [];
            for (const result of settled) {
                if (result.status === 'fulfilled' && result.value?.data) {
                    successful.push(result.value);
                }
            }

            return mergePaginatedResults<Creator>(successful, sortBy, sortDir, skip, limit);
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


/**
 * Hook for fetching Dashboard data with Multi-Vault support.
 */
export function useMultiVaultDashboard(
    options?: Partial<UseQueryOptions<DashboardData, Error>>
): MultiVaultQueryResult<DashboardData> {
    const { vaults, onlineVaults, activeVault, isAggregated } = useVault();
    const offlineVaults = vaults.filter(v => !v.isLocal && v.status !== 'online');

    const queryKey = ['multi-vault', 'dashboard', isAggregated, isAggregated ? onlineVaults.map(v => v.id) : activeVault.id];

    const query = useQuery<DashboardData, Error>({
        queryKey,
        queryFn: async ({ signal }) => {
            if (!isAggregated) {
                return await fetchFromVault<DashboardData>(activeVault, '/api/dashboard/', undefined, signal);
            }

            const settled = await Promise.allSettled(
                onlineVaults.map(async vault => {
                    const data = await fetchFromVault<DashboardData>(vault, '/api/dashboard/', undefined, signal);
                    return { data, vault };
                })
            );

            const statsList: Array<{ stats: LibraryStats; vault: VaultEntry }> = [];
            const allAlerts: DashboardData['health_alerts'] = [];

            for (const result of settled) {
                if (result.status === 'fulfilled' && result.value?.data) {
                    if (result.value.data.stats) {
                        statsList.push({ stats: result.value.data.stats, vault: result.value.vault });
                    }
                    if (result.value.data.health_alerts) {
                        allAlerts.push(...result.value.data.health_alerts);
                    }
                }
            }

            return {
                stats: mergeDashboardStats(statsList),
                health_alerts: allAlerts
            };
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

/**
 * Hook for fetching Tag Cloud items with Multi-Vault support.
 */
export function useMultiVaultTagCloud(
    params: { limit?: number; scope?: string } = {},
    options?: Partial<UseQueryOptions<TagCount[], Error>>
): MultiVaultQueryResult<TagCount[]> {
    const { vaults, onlineVaults, activeVault, isAggregated } = useVault();
    const offlineVaults = vaults.filter(v => !v.isLocal && v.status !== 'online');

    const limit = params.limit ?? DEFAULT_CLOUD_LIMIT;
    const queryKey = ['multi-vault', 'tags', 'cloud', isAggregated, isAggregated ? onlineVaults.map(v => v.id) : activeVault.id, params];

    const query = useQuery<TagCount[], Error>({
        queryKey,
        queryFn: async ({ signal }) => {
            if (!isAggregated) {
                return await fetchFromVault<TagCount[]>(activeVault, '/api/tags/cloud', params, signal);
            }

            const settled = await Promise.allSettled(
                onlineVaults.map(vault =>
                    fetchFromVault<TagCount[]>(vault, '/api/tags/cloud', params, signal)
                )
            );

            const tagLists: TagCount[][] = [];
            for (const res of settled) {
                if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                    tagLists.push(res.value);
                }
            }

            return mergeTagCloudItems(tagLists, limit);
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

/**
 * Hook for fetching Characters with Multi-Vault support.
 */
export function useMultiVaultCharacters(
    params: { limit?: number; scope?: string; search?: string; sort_by?: string; sort_dir?: string } = {},
    options?: Partial<UseQueryOptions<{ items: Character[]; total: number }, Error>>
): MultiVaultQueryResult<{ items: Character[]; total: number }> {
    const { vaults, onlineVaults, activeVault, isAggregated } = useVault();
    const offlineVaults = vaults.filter(v => !v.isLocal && v.status !== 'online');

    const limit = params.limit ?? DEFAULT_CLOUD_LIMIT;
    const queryKey = ['multi-vault', 'characters', isAggregated, isAggregated ? onlineVaults.map(v => v.id) : activeVault.id, params];

    const query = useQuery<{ items: Character[]; total: number }, Error>({
        queryKey,
        queryFn: async ({ signal }) => {
            if (!isAggregated) {
                return await fetchFromVault<{ items: Character[]; total: number }>(activeVault, '/api/characters/', params, signal);
            }

            const settled = await Promise.allSettled(
                onlineVaults.map(vault =>
                    fetchFromVault<{ items: Character[]; total: number }>(vault, '/api/characters/', params, signal)
                )
            );

            const map = new Map<string, Character>();
            let totalCount = 0;

            for (const res of settled) {
                if (res.status === 'fulfilled' && res.value?.items && Array.isArray(res.value.items)) {
                    totalCount += res.value.total || 0;
                    for (const char of res.value.items) {
                        const key = char.name.toLowerCase();
                        if (map.has(key)) {
                            const existing = map.get(key)!;
                            existing.image_count = (existing.image_count || 0) + (char.image_count || 0);
                            existing.set_count = (existing.set_count || 0) + (char.set_count || 0);
                        } else {
                            map.set(key, { ...char });
                        }
                    }
                }
            }

            const merged = Array.from(map.values()).sort(
                (a, b) => ((b.image_count || 0) + (b.set_count || 0)) - ((a.image_count || 0) + (a.set_count || 0))
            );
            const items = limit > 0 ? merged.slice(0, limit) : merged;
            return { items, total: totalCount };
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

/**
 * Hook for fetching Franchises with Multi-Vault support.
 */
export function useMultiVaultFranchises(
    params: { limit?: number; scope?: string; search?: string; sort_by?: string; sort_dir?: string } = {},
    options?: Partial<UseQueryOptions<{ items: Franchise[]; total: number }, Error>>
): MultiVaultQueryResult<{ items: Franchise[]; total: number }> {
    const { vaults, onlineVaults, activeVault, isAggregated } = useVault();
    const offlineVaults = vaults.filter(v => !v.isLocal && v.status !== 'online');

    const limit = params.limit ?? DEFAULT_CLOUD_LIMIT;

    const queryKey = ['multi-vault', 'franchises', isAggregated, isAggregated ? onlineVaults.map(v => v.id) : activeVault.id, params];

    const query = useQuery<{ items: Franchise[]; total: number }, Error>({
        queryKey,
        queryFn: async ({ signal }) => {
            if (!isAggregated) {
                return await fetchFromVault<{ items: Franchise[]; total: number }>(activeVault, '/api/franchises/', params, signal);
            }

            const settled = await Promise.allSettled(
                onlineVaults.map(vault =>
                    fetchFromVault<{ items: Franchise[]; total: number }>(vault, '/api/franchises/', params, signal)
                )
            );

            const map = new Map<string, Franchise>();
            let totalCount = 0;

            for (const res of settled) {
                if (res.status === 'fulfilled' && res.value?.items && Array.isArray(res.value.items)) {
                    totalCount += res.value.total || 0;
                    for (const f of res.value.items) {
                        const key = f.name.toLowerCase();
                        if (map.has(key)) {
                            const existing = map.get(key)!;
                            existing.image_count = (existing.image_count || 0) + (f.image_count || 0);
                            existing.set_count = (existing.set_count || 0) + (f.set_count || 0);
                        } else {
                            map.set(key, { ...f });
                        }
                    }
                }
            }

            const merged = Array.from(map.values()).sort(
                (a, b) => ((b.image_count || 0) + (b.set_count || 0)) - ((a.image_count || 0) + (a.set_count || 0))
            );
            const items = limit > 0 ? merged.slice(0, limit) : merged;
            return { items, total: totalCount };
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

/**
 * Hook for fetching a random inspiration image with Multi-Vault support.
 */
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
