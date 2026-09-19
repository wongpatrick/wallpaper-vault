/**
 * @file
 * Unit tests for WebLocalStorageVaultAdapter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebLocalStorageVaultAdapter } from './WebLocalStorageVaultAdapter';
import { DEFAULT_REGISTRY } from './VaultStorageAdapter';
import type { VaultRegistryData } from '../../types/electron';

describe('WebLocalStorageVaultAdapter', () => {
    let adapter: WebLocalStorageVaultAdapter;
    const testKey = 'test_vault_registry';

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        adapter = new WebLocalStorageVaultAdapter(testKey);
    });

    it('returns DEFAULT_REGISTRY when localStorage is empty', () => {
        const registry = adapter.loadRegistrySync();
        expect(registry).toEqual(DEFAULT_REGISTRY);
    });

    it('handles corrupted JSON in localStorage gracefully with fallback to DEFAULT_REGISTRY', () => {
        const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem(testKey, 'not-valid-json{[[[');

        const registry = adapter.loadRegistrySync();
        expect(registry).toEqual(DEFAULT_REGISTRY);
        expect(spyError).toHaveBeenCalled();
        spyError.mockRestore();
    });

    it('loads existing valid registry from localStorage', async () => {
        const customRegistry: VaultRegistryData = {
            activeVaultId: 'custom-1',
            vaults: [
                { id: 'custom-1', label: 'Custom', url: 'http://localhost:8000', isLocal: true, status: 'online' }
            ]
        };
        localStorage.setItem(testKey, JSON.stringify(customRegistry));

        const registry = await adapter.loadRegistry();
        expect(registry).toEqual(customRegistry);
    });

    it('sets active vault and persists to localStorage', async () => {
        const initial = { ...DEFAULT_REGISTRY };
        const updated = await adapter.setActiveVault('other-vault', initial);
        expect(updated.activeVaultId).toBe('other-vault');
        expect(JSON.parse(localStorage.getItem(testKey)!)).toEqual(updated);
    });

    it('adds a vault, tests its connection, and saves to localStorage', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 200,
            json: async () => ({ vault_id: 'vid-1', vault_name: 'Remote NAS', version: '2.0.0' })
        } as unknown as Response);

        const { vault, registry } = await adapter.addVault(
            { label: 'New Remote', url: 'http://192.168.1.200:8000', apiKey: 'mykey' },
            DEFAULT_REGISTRY
        );

        expect(vault.label).toBe('New Remote');
        expect(vault.url).toBe('http://192.168.1.200:8000');
        expect(vault.status).toBe('online');
        expect(vault.vaultId).toBe('vid-1');
        expect(registry.vaults.length).toBe(2);
        expect(JSON.parse(localStorage.getItem(testKey)!)).toEqual(registry);
    });

    it('updates an existing vault, re-tests connection, and saves', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 200,
            json: async () => ({ vault_id: 'vid-up', vault_name: 'Updated Server', version: '2.1.0' })
        } as unknown as Response);

        const initialRegistry: VaultRegistryData = {
            activeVaultId: 'vault-remote',
            vaults: [
                DEFAULT_REGISTRY.vaults[0],
                { id: 'vault-remote', label: 'Old Name', url: 'http://old:8000', isLocal: false, status: 'offline' }
            ]
        };

        const { vault, registry } = await adapter.updateVault(
            'vault-remote',
            { label: 'New Name', url: 'http://new:8000' },
            initialRegistry
        );

        expect(vault.label).toBe('New Name');
        expect(vault.url).toBe('http://new:8000');
        expect(vault.status).toBe('online');
        expect(registry.vaults[1].label).toBe('New Name');
        expect(JSON.parse(localStorage.getItem(testKey)!)).toEqual(registry);
    });

    it('throws error when updating non-existent vault', async () => {
        await expect(adapter.updateVault('non-existent', { label: 'Fail' }, DEFAULT_REGISTRY)).rejects.toThrow(
            'Vault with id non-existent not found'
        );
    });

    it('removes a remote vault and persists', async () => {
        const initialRegistry: VaultRegistryData = {
            activeVaultId: 'vault-remote',
            vaults: [
                DEFAULT_REGISTRY.vaults[0],
                { id: 'vault-remote', label: 'Remote', url: 'http://remote:8000', isLocal: false, status: 'online' }
            ]
        };

        const updated = await adapter.removeVault('vault-remote', initialRegistry);
        expect(updated.vaults.length).toBe(1);
        expect(updated.activeVaultId).toBe('local-vault');
        expect(JSON.parse(localStorage.getItem(testKey)!)).toEqual(updated);
    });

    it('throws error when attempting to remove local vault', async () => {
        await expect(adapter.removeVault('local-vault', DEFAULT_REGISTRY)).rejects.toThrow(
            'Local vault is pinned and cannot be removed'
        );
    });

    it('tests connection handling 401 unauthorized and errors', async () => {
        // Test 401
        globalThis.fetch = vi.fn().mockResolvedValueOnce({
            status: 401
        } as unknown as Response);

        const res401 = await adapter.testConnection('http://secure:8000', 'wrong-key');
        expect(res401.status).toBe('unauthorized');
        expect(res401.success).toBe(false);

        // Test network failure
        globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
        const resErr = await adapter.testConnection('http://unreachable:8000');
        expect(resErr.status).toBe('offline');
        expect(resErr.error).toBe('Network error');
    });

    it('refreshes health across all vaults', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 200,
            json: async () => ({ vault_id: 'vid-ok', vault_name: 'Healthy', version: '1.0.0' })
        } as unknown as Response);

        const refreshed = await adapter.refreshHealth(DEFAULT_REGISTRY);
        expect(refreshed.vaults[0].status).toBe('online');
        expect(refreshed.vaults[0].vaultId).toBe('vid-ok');
    });

    it('subscribes to updates and reacts to window storage events', () => {
        const callback = vi.fn();
        const unsubscribe = adapter.subscribeToUpdates(callback);
        expect(typeof unsubscribe).toBe('function');

        const newRegistry: VaultRegistryData = {
            activeVaultId: 'storage-vault',
            vaults: [
                { id: 'storage-vault', label: 'Cross Tab', url: 'http://tab:8000', isLocal: false, status: 'online' }
            ]
        };

        window.dispatchEvent(new StorageEvent('storage', {
            key: testKey,
            newValue: JSON.stringify(newRegistry)
        }));

        expect(callback).toHaveBeenCalledWith(newRegistry);

        expect(() => unsubscribe()).not.toThrow();
    });
});
