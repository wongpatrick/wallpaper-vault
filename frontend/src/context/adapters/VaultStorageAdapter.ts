/**
 * @file
 * Defines the VaultStorageAdapter strategy interface for platform-specific
 * vault registry persistence, connection testing, and health synchronization.
 */
import { API_BASE_URL } from '../../config';
import type { VaultEntry, VaultRegistryData, TestConnectionResult } from '../../types/electron';

export const DEFAULT_LOCAL_VAULT: VaultEntry = {
    id: 'local-vault',
    label: 'Local',
    url: API_BASE_URL,
    apiKey: '',
    isLocal: true,
    status: 'online'
};

export const DEFAULT_REGISTRY: VaultRegistryData = {
    activeVaultId: 'local-vault',
    vaults: [DEFAULT_LOCAL_VAULT]
};

export interface VaultStorageAdapter {
    /**
     * Synchronously returns the initially available registry if available (e.g. from localStorage),
     * or DEFAULT_REGISTRY.
     */
    loadRegistrySync?(): VaultRegistryData;

    /**
     * Loads the vault registry asynchronously from platform storage.
     */
    loadRegistry(): Promise<VaultRegistryData>;

    /**
     * Sets the active vault in platform storage and returns the updated registry.
     */
    setActiveVault(id: string, registry: VaultRegistryData): Promise<VaultRegistryData>;

    /**
     * Adds a new vault to platform storage and returns the created vault and updated registry.
     */
    addVault(
        payload: { label: string; url: string; apiKey?: string },
        registry: VaultRegistryData
    ): Promise<{ vault: VaultEntry; registry: VaultRegistryData }>;

    /**
     * Updates an existing vault in platform storage and returns the updated vault and registry.
     */
    updateVault(
        id: string,
        updates: Partial<{ label: string; url: string; apiKey: string }>,
        registry: VaultRegistryData
    ): Promise<{ vault: VaultEntry; registry: VaultRegistryData }>;

    /**
     * Removes a vault from platform storage and returns the updated registry.
     */
    removeVault(id: string, registry: VaultRegistryData): Promise<VaultRegistryData>;

    /**
     * Tests connectivity to a target vault endpoint.
     */
    testConnection(url: string, apiKey?: string): Promise<TestConnectionResult>;

    /**
     * Refreshes health status across all registered vaults.
     */
    refreshHealth(registry: VaultRegistryData): Promise<VaultRegistryData>;

    /**
     * Subscribes to live registry update broadcasts from the platform.
     * Returns an unsubscribe callback.
     */
    subscribeToUpdates?(callback: (registry: VaultRegistryData) => void): () => void;
}
