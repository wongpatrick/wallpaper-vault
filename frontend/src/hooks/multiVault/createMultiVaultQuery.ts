/**
 * @file
 * Generic React Query factory for multi-vault data retrieval and pagination.
 */
import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { useVault } from '../useVault';
import { decorateWithVault, fetchFromVault } from './fetchFromVault';
import { mergePaginatedResults } from './multiVaultAggregation';
import type {
    MultiVaultPage,
    MultiVaultQueryConfig,
    MultiVaultQueryResult,
    Sortable,
    VaultEntry,
    VaultError
} from './types';

/**
 * Maximum items to fetch per vault during aggregated pagination to prevent unbounded over-fetching.
 */
export const MAX_PREFETCH = 500;

interface QueryPayload<T> {
    data: T;
    partialErrors: VaultError[];
}

export type MultiVaultQueryOptions<TData> = Omit<
    UseQueryOptions<QueryPayload<TData>, Error>,
    'queryKey' | 'queryFn'
>;

/**
 * Creates a reusable multi-vault React Query hook for a resource.
 */
export function createMultiVaultQuery<
    TParams = Record<string, unknown>,
    TResponse = unknown,
    TMerged = TResponse
>(config: MultiVaultQueryConfig<TParams, TResponse, TMerged>) {
    return function useCreatedMultiVaultQuery(
        params?: TParams,
        options?: Partial<MultiVaultQueryOptions<TMerged>>
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

        const query = useQuery<QueryPayload<TMerged>, Error>({
            queryKey,
            queryFn: async ({ signal }) => {
                const effectiveParams = (params ?? {}) as TParams;

                if (!isAggregated) {
                    const raw = await config.fetchFn(activeVault, effectiveParams, signal);
                    const transformed = config.transformSingle(raw, activeVault, effectiveParams);
                    return { data: transformed, partialErrors: [] };
                }

                const vaultParams = config.getAggregatedParams
                    ? config.getAggregatedParams(effectiveParams)
                    : effectiveParams;

                const settled = await Promise.allSettled(
                    onlineVaults.map(async vault => {
                        const data = await config.fetchFn(vault, vaultParams, signal);
                        return { data, vault };
                    })
                );

                const successful: Array<{ data: TResponse; vault: VaultEntry }> = [];
                const partialErrors: VaultError[] = [];

                for (let i = 0; i < settled.length; i++) {
                    const res = settled[i];
                    const vault = onlineVaults[i];
                    if (res.status === 'fulfilled') {
                        if (res.value?.data !== undefined && res.value?.data !== null) {
                            successful.push(res.value);
                        }
                    } else {
                        const error = res.reason instanceof Error ? res.reason : new Error(String(res.reason));
                        partialErrors.push({
                            vaultId: vault.id,
                            vaultLabel: vault.label,
                            error
                        });
                    }
                }

                // If every online vault failed, fail the query so consumer error boundaries/states activate
                if (successful.length === 0 && onlineVaults.length > 0) {
                    throw partialErrors[0]?.error || new Error('All online vaults failed to respond');
                }

                const mergedData = config.mergeFn(successful, effectiveParams);
                return { data: mergedData, partialErrors };
            },
            ...options
        });

        return {
            data: query.data?.data,
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
    };
}

/**
 * Creates a paginated multi-vault React Query hook for collection resources (Sets, Images, Creators).
 */
export function createPaginatedMultiVaultQuery<
    TItem extends Sortable,
    TPage extends { items?: TItem[]; total?: number; skip?: number; limit?: number }
>(
    resource: string,
    endpoint: string,
    defaultLimit: number,
    defaultSort: string,
    defaultDir: 'asc' | 'desc'
) {
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
            return { ...params, skip: 0, limit: Math.min(skip + limit, MAX_PREFETCH) };
        },
        mergeFn: (successful, params) => {
            const skip = Number(params.skip) || 0;
            const limit = Number(params.limit) || defaultLimit;
            const sortBy = typeof params.sort_by === 'string' ? params.sort_by : defaultSort;
            const sortDir = (params.sort_dir === 'asc' || params.sort_dir === 'desc')
                ? params.sort_dir
                : defaultDir;

            return mergePaginatedResults<TItem>(
                successful,
                sortBy,
                sortDir,
                skip,
                limit
            );
        }
    });
}
