/**
 * @file
 * Multi-vault hooks and utilities module entry point.
 */
import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import type {
    Character,
    Creator,
    CreatorPage,
    DashboardData,
    Franchise,
    Image,
    ImagePage,
    LibraryStats,
    SetPage,
    SetSummary,
    TagCount
} from '../../api/model';
import { useVault } from '../useVault';
import {
    createMultiVaultQuery,
    createPaginatedMultiVaultQuery
} from './createMultiVaultQuery';
import { decorateWithVault, fetchFromVault } from './fetchFromVault';
import {
    DEFAULT_CLOUD_LIMIT,
    mergeDashboardStats,
    mergeTagCloudItems,
    mergeTaxonomyItems
} from './multiVaultAggregation';
import type {
    MultiVaultQueryResult,
    TaxonomyQueryParams,
    VaultEntry,
    VaultError
} from './types';

export * from './types';
export * from './fetchFromVault';
export * from './multiVaultSort';
export * from './multiVaultAggregation';
export * from './createMultiVaultQuery';

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
    transformSingle: (res) => res,
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
    transformSingle: (res) => res,
    mergeFn: (successful, params) => {
        const tagLists = successful.map(s => s.data).filter(Boolean);
        const limit = params.limit ?? DEFAULT_CLOUD_LIMIT;
        return mergeTagCloudItems(tagLists, limit);
    }
});

/** Hook for fetching Characters with Multi-Vault support. */
export const useMultiVaultCharacters = createMultiVaultQuery<
    TaxonomyQueryParams,
    { items: Character[]; total: number },
    { items: Character[]; total: number }
>({
    resource: 'characters',
    fetchFn: (vault, params, signal) => fetchFromVault<{ items: Character[]; total: number }>(vault, '/api/characters/', params, signal),
    transformSingle: (res) => res,
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
    transformSingle: (res) => res,
    mergeFn: (successful, params) => mergeTaxonomyItems(successful, params.limit ?? DEFAULT_CLOUD_LIMIT)
});

interface RandomImagePayload {
    image: Image;
    partialErrors: VaultError[];
}

/** Hook for fetching a random inspiration image with Multi-Vault support. */
export function useMultiVaultRandomImage(
    params: { log_rotation?: boolean } = {},
    options?: Partial<UseQueryOptions<RandomImagePayload, Error>>
): MultiVaultQueryResult<Image> {
    const { vaults, onlineVaults, activeVault, isAggregated } = useVault();
    const offlineVaults = vaults.filter(v => !v.isLocal && v.status !== 'online');

    const queryKey = [
        'multi-vault',
        'random-image',
        isAggregated,
        isAggregated ? onlineVaults.map(v => v.id) : activeVault.id,
        params
    ];

    const query = useQuery<RandomImagePayload, Error>({
        queryKey,
        queryFn: async ({ signal }) => {
            if (!isAggregated || onlineVaults.length === 0) {
                const item = await fetchFromVault<Image>(activeVault, '/api/images/random', params, signal);
                return {
                    image: decorateWithVault(item, activeVault),
                    partialErrors: []
                };
            }

            const randomIndex = Math.floor(Math.random() * onlineVaults.length);
            const selectedVault = onlineVaults[randomIndex] || activeVault;

            try {
                const item = await fetchFromVault<Image>(selectedVault, '/api/images/random', params, signal);
                return {
                    image: decorateWithVault(item, selectedVault),
                    partialErrors: []
                };
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                console.warn(
                    `[MultiVault] Failed to fetch random image from ${selectedVault.label}, falling back to active vault:`,
                    error
                );
                const fallbackItem = await fetchFromVault<Image>(activeVault, '/api/images/random', params, signal);
                return {
                    image: decorateWithVault(fallbackItem, activeVault),
                    partialErrors: [{
                        vaultId: selectedVault.id,
                        vaultLabel: selectedVault.label,
                        error
                    }]
                };
            }
        },
        ...options
    });

    return {
        data: query.data?.image,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
        isAggregated,
        onlineCount: onlineVaults.length,
        totalVaultsCount: vaults.length,
        offlineVaults,
        partialErrors: query.data?.partialErrors || []
    };
}
