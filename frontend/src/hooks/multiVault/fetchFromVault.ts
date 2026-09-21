/**
 * @file
 * Network transport and item decoration utilities for multi-vault queries.
 */
import { AXIOS_INSTANCE } from '../../api/axios-instance';
import type { VaultEntry, WithMultiVault } from './types';

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
        skipAuthInterceptor: true
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
