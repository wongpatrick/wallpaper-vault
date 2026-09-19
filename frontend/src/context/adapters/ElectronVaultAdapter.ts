/**
 * @file
 * ElectronVaultAdapter implementation of VaultStorageAdapter.
 * Delegates registry management, health monitoring, and connection tests
 * to the Electron main process via window.electron IPC bridge.
 */
import type { VaultEntry, VaultRegistryData, TestConnectionResult } from '../../types/electron';
import { type VaultStorageAdapter, DEFAULT_REGISTRY } from './VaultStorageAdapter';

export class ElectronVaultAdapter implements VaultStorageAdapter {
    loadRegistrySync(): VaultRegistryData {
        return DEFAULT_REGISTRY;
    }

    async loadRegistry(): Promise<VaultRegistryData> {
        try {
            const data = await window.electron.getVaultRegistry();
            if (data && Array.isArray(data.vaults) && data.vaults.length > 0) {
                return data;
            }
        } catch (err) {
            console.error('[ElectronVaultAdapter] Failed to load registry from Electron:', err);
        }
        return DEFAULT_REGISTRY;
    }

    async setActiveVault(id: string, registry: VaultRegistryData): Promise<VaultRegistryData> {
        await window.electron.setActiveVault(id);
        const fresh = await window.electron.getVaultRegistry();
        if (fresh && Array.isArray(fresh.vaults)) {
            return fresh;
        }
        return { ...registry, activeVaultId: id };
    }

    async addVault(
        payload: { label: string; url: string; apiKey?: string },
        registry: VaultRegistryData
    ): Promise<{ vault: VaultEntry; registry: VaultRegistryData }> {
        const vault = await window.electron.addVault(payload);
        const updated = await window.electron.getVaultRegistry();
        return {
            vault,
            registry: updated && Array.isArray(updated.vaults) ? updated : { ...registry, vaults: [...registry.vaults, vault] }
        };
    }

    async updateVault(
        id: string,
        updates: Partial<{ label: string; url: string; apiKey: string }>,
        registry: VaultRegistryData
    ): Promise<{ vault: VaultEntry; registry: VaultRegistryData }> {
        const vault = await window.electron.updateVault(id, updates);
        const freshRegistry = await window.electron.getVaultRegistry();
        return {
            vault,
            registry: freshRegistry && Array.isArray(freshRegistry.vaults) ? freshRegistry : registry
        };
    }

    async removeVault(id: string, registry: VaultRegistryData): Promise<VaultRegistryData> {
        const updated = await window.electron.removeVault(id);
        if (updated && Array.isArray(updated.vaults)) {
            return updated;
        }
        return { ...registry, vaults: registry.vaults.filter(v => v.id !== id) };
    }

    async testConnection(url: string, apiKey?: string): Promise<TestConnectionResult> {
        return await window.electron.testVaultConnection(url, apiKey);
    }

    async refreshHealth(registry: VaultRegistryData): Promise<VaultRegistryData> {
        try {
            const fresh = await window.electron.getVaultRegistry();
            if (fresh && Array.isArray(fresh.vaults)) {
                return fresh;
            }
        } catch (err) {
            console.error('[ElectronVaultAdapter] Failed to refresh health in Electron:', err);
        }
        return registry;
    }

    subscribeToUpdates(callback: (registry: VaultRegistryData) => void): () => void {
        if (typeof window !== 'undefined' && window.electron?.onVaultRegistryUpdated) {
            return window.electron.onVaultRegistryUpdated(callback);
        }
        return () => {};
    }
}
