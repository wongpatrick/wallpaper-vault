/**
 * @file
 * Types for multi-vault aggregated entities and metadata.
 */

export type { VaultEntry } from './electron';

export interface MultiVaultItemMeta {
    _vaultId?: string;
    _vaultLabel?: string;
    _vaultUrl?: string;
    _vaultApiKey?: string;
}

export type WithMultiVault<T> = T & MultiVaultItemMeta;

