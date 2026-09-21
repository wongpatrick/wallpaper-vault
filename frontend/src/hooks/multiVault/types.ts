/**
 * @file
 * Type definitions for multi-vault query infrastructure, pagination, sorting, and error tracking.
 */
import type { VaultEntry } from '../../types/electron';
import type { WithMultiVault } from '../../types/vault';

export type { VaultEntry } from '../../types/electron';
export type { WithMultiVault } from '../../types/vault';

/**
 * Details of a query error that occurred on an individual vault during aggregated queries.
 */
export interface VaultError {
    vaultId: string;
    vaultLabel: string;
    error: Error;
}

/**
 * Common container for paginated entities aggregated across vaults.
 */
export type MultiVaultPage<T extends object> = {
    items: WithMultiVault<T>[];
    total: number;
    skip?: number;
    limit?: number;
};

/**
 * Standard return shape for multi-vault React Query hooks.
 */
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
    partialErrors: VaultError[];
}

/**
 * Generic constraint for polymorphic entities sortable across multiple backends.
 */
export type Sortable = object;

/**
 * Configuration options for the multi-vault query factory.
 */
export interface MultiVaultQueryConfig<TParams, TResponse, TMerged = TResponse> {
    resource: string | string[];
    fetchFn: (vault: VaultEntry, params: TParams, signal?: AbortSignal) => Promise<TResponse>;
    mergeFn: (
        responses: Array<{ data: TResponse; vault: VaultEntry }>,
        params: TParams
    ) => TMerged;
    transformSingle: (response: TResponse, vault: VaultEntry, params: TParams) => TMerged;
    getAggregatedParams?: (params: TParams) => TParams;
}

/**
 * Parameters for querying taxonomy entities (characters, franchises).
 */
export type TaxonomyQueryParams = {
    limit?: number;
    scope?: string;
    search?: string;
    sort_by?: string;
    sort_dir?: string;
};
