/**
 * @file
 * WebLocalStorageVaultAdapter implementation of VaultStorageAdapter.
 * Manages vault registry persistence in browser localStorage and performs
 * connection health checks via the Fetch API.
 */
import type { VaultEntry, VaultRegistryData, TestConnectionResult } from '../../types/electron';
import { type VaultStorageAdapter, DEFAULT_REGISTRY } from './VaultStorageAdapter';

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_UNAUTHORIZED = 401;

const FETCH_TIMEOUT_MS = 5000;

export class WebLocalStorageVaultAdapter implements VaultStorageAdapter {
    private storageKey: string;

    constructor(storageKey = 'vault_registry') {
        this.storageKey = storageKey;
    }

    loadRegistrySync(): VaultRegistryData {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && Array.isArray(parsed.vaults) && parsed.vaults.length > 0) {
                    return parsed;
                }
            }
        } catch (err) {
            console.error('[WebLocalStorageVaultAdapter] Failed to parse vault registry from localStorage:', err);
        }
        return DEFAULT_REGISTRY;
    }

    async loadRegistry(): Promise<VaultRegistryData> {
        return this.loadRegistrySync();
    }

    async setActiveVault(id: string, registry: VaultRegistryData): Promise<VaultRegistryData> {
        const newRegistry: VaultRegistryData = { ...registry, activeVaultId: id };
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(newRegistry));
        } catch (err) {
            console.error('[WebLocalStorageVaultAdapter] Failed to save active vault to localStorage:', err);
        }
        return newRegistry;
    }

    async addVault(
        payload: { label: string; url: string; apiKey?: string },
        registry: VaultRegistryData
    ): Promise<{ vault: VaultEntry; registry: VaultRegistryData }> {
        const id = `vault-${Date.now()}`;
        const cleanUrl = payload.url.trim().replace(/\/+$/, '');
        const newEntry: VaultEntry = {
            id,
            label: payload.label.trim() || 'Remote Vault',
            url: cleanUrl,
            apiKey: payload.apiKey?.trim() || '',
            isLocal: false,
            status: 'offline'
        };

        const testRes = await this.testConnection(cleanUrl, newEntry.apiKey);
        newEntry.status = testRes.status;
        if (testRes.success) {
            newEntry.vaultId = testRes.vaultId;
            newEntry.vaultName = testRes.vaultName;
            newEntry.version = testRes.version;
            newEntry.lastSeen = new Date().toISOString();
        }

        const newRegistry: VaultRegistryData = {
            ...registry,
            vaults: [...registry.vaults, newEntry]
        };
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(newRegistry));
        } catch (err) {
            console.error('[WebLocalStorageVaultAdapter] Failed to save vault registry to localStorage:', err);
        }
        return { vault: newEntry, registry: newRegistry };
    }

    async updateVault(
        id: string,
        updates: Partial<{ label: string; url: string; apiKey: string }>,
        registry: VaultRegistryData
    ): Promise<{ vault: VaultEntry; registry: VaultRegistryData }> {
        const vaultIndex = registry.vaults.findIndex(v => v.id === id);
        if (vaultIndex === -1) {
            throw new Error(`Vault with id ${id} not found`);
        }

        const target = { ...registry.vaults[vaultIndex] };
        if (updates.label !== undefined) target.label = updates.label;
        if (!target.isLocal) {
            if (updates.url !== undefined) target.url = updates.url.trim().replace(/\/+$/, '');
            if (updates.apiKey !== undefined) target.apiKey = updates.apiKey.trim();
        }

        const testRes = await this.testConnection(target.url, target.apiKey);
        target.status = testRes.status;
        if (testRes.success) {
            target.vaultId = testRes.vaultId;
            target.vaultName = testRes.vaultName;
            target.version = testRes.version;
            target.lastSeen = new Date().toISOString();
        }

        const newVaults = [...registry.vaults];
        newVaults[vaultIndex] = target;
        const newRegistry: VaultRegistryData = { ...registry, vaults: newVaults };
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(newRegistry));
        } catch (err) {
            console.error('[WebLocalStorageVaultAdapter] Failed to save updated vault to localStorage:', err);
        }

        return { vault: target, registry: newRegistry };
    }

    async removeVault(id: string, registry: VaultRegistryData): Promise<VaultRegistryData> {
        const vault = registry.vaults.find(v => v.id === id);
        if (!vault) return registry;
        if (vault.isLocal) {
            throw new Error('Local vault is pinned and cannot be removed');
        }

        const newVaults = registry.vaults.filter(v => v.id !== id);
        let newActiveId = registry.activeVaultId;
        if (newActiveId === id) {
            newActiveId = newVaults.find(v => v.isLocal)?.id || newVaults[0]?.id || DEFAULT_REGISTRY.activeVaultId;
        }

        const newRegistry: VaultRegistryData = {
            activeVaultId: newActiveId,
            vaults: newVaults
        };
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(newRegistry));
        } catch (err) {
            console.error('[WebLocalStorageVaultAdapter] Failed to persist registry after removal:', err);
        }
        return newRegistry;
    }

    async testConnection(url: string, apiKey?: string): Promise<TestConnectionResult> {
        try {
            const cleanUrl = url.trim().replace(/\/+$/, '');
            const headers: Record<string, string> = {};
            if (apiKey) {
                headers['X-API-Key'] = apiKey;
            }
            const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
                ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
                : undefined;
            const res = await fetch(`${cleanUrl}/api/vault/identity`, { headers, signal });
            if (res.status === HTTP_STATUS_OK) {
                const data = await res.json();
                return {
                    success: true,
                    status: 'online',
                    vaultId: data.vault_id,
                    vaultName: data.vault_name,
                    version: data.version
                };
            } else if (res.status === HTTP_STATUS_UNAUTHORIZED) {
                return {
                    success: false,
                    status: 'unauthorized',
                    error: 'Unauthorized: Invalid or missing API key'
                };
            } else {
                return {
                    success: false,
                    status: 'offline',
                    error: `Server returned HTTP ${res.status}`
                };
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Connection failed';
            return {
                success: false,
                status: 'offline',
                error: msg
            };
        }
    }

    async refreshHealth(registry: VaultRegistryData): Promise<VaultRegistryData> {
        const updatedVaults = await Promise.all(
            registry.vaults.map(async (vault) => {
                const res = await this.testConnection(vault.url, vault.apiKey);
                const updated = { ...vault, status: res.status };
                if (res.success) {
                    updated.vaultId = res.vaultId;
                    updated.vaultName = res.vaultName;
                    updated.version = res.version;
                    updated.lastSeen = new Date().toISOString();
                }
                return updated;
            })
        );

        const newRegistry: VaultRegistryData = { ...registry, vaults: updatedVaults };
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(newRegistry));
        } catch (err) {
            console.error('[WebLocalStorageVaultAdapter] Failed to save refreshed health to localStorage:', err);
        }
        return newRegistry;
    }

    subscribeToUpdates(callback: (registry: VaultRegistryData) => void): () => void {
        if (typeof window === 'undefined') return () => {};
        const handler = (e: StorageEvent) => {
            if (e.key === this.storageKey && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    if (parsed && Array.isArray(parsed.vaults)) {
                        callback(parsed);
                    }
                } catch {
                    // ignore malformed cross-tab update
                }
            }
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }
}
