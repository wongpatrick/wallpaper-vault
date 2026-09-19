/**
 * @file
 * Unit tests for ElectronVaultAdapter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ElectronVaultAdapter } from './ElectronVaultAdapter';
import { DEFAULT_REGISTRY } from './VaultStorageAdapter';
import type { VaultEntry, VaultRegistryData } from '../../types/electron';

describe('ElectronVaultAdapter', () => {
    let adapter: ElectronVaultAdapter;

    const mockRegistry: VaultRegistryData = {
        activeVaultId: 'vault-1',
        vaults: [
            { id: 'vault-1', label: 'Primary', url: 'http://localhost:8000', isLocal: true, status: 'online' },
            { id: 'vault-2', label: 'Secondary', url: 'http://192.168.1.50:8000', isLocal: false, status: 'online' }
        ]
    };

    beforeEach(() => {
        vi.clearAllMocks();
        adapter = new ElectronVaultAdapter();
        // Setup window.electron mock
        window.electron = {
            getVaultRegistry: vi.fn().mockResolvedValue(mockRegistry),
            setActiveVault: vi.fn().mockResolvedValue(mockRegistry.vaults[1]),
            addVault: vi.fn().mockResolvedValue({
                id: 'vault-3',
                label: 'Added',
                url: 'http://192.168.1.60:8000',
                isLocal: false,
                status: 'offline'
            } as VaultEntry),
            updateVault: vi.fn().mockResolvedValue({
                id: 'vault-2',
                label: 'Updated',
                url: 'http://192.168.1.50:8000',
                isLocal: false,
                status: 'online'
            } as VaultEntry),
            removeVault: vi.fn().mockResolvedValue({
                activeVaultId: 'vault-1',
                vaults: [mockRegistry.vaults[0]]
            }),
            testVaultConnection: vi.fn().mockResolvedValue({
                success: true,
                status: 'online',
                vaultId: 'v-123',
                vaultName: 'Remote',
                version: '1.0.0'
            }),
            onVaultRegistryUpdated: vi.fn().mockReturnValue(() => {})
        } as unknown as typeof window.electron;
    });

    it('returns default registry synchronously via loadRegistrySync', () => {
        expect(adapter.loadRegistrySync()).toEqual(DEFAULT_REGISTRY);
    });

    it('loads registry from window.electron.getVaultRegistry', async () => {
        const result = await adapter.loadRegistry();
        expect(window.electron.getVaultRegistry).toHaveBeenCalled();
        expect(result).toEqual(mockRegistry);
    });

    it('falls back to DEFAULT_REGISTRY if getVaultRegistry throws', async () => {
        vi.mocked(window.electron.getVaultRegistry).mockRejectedValueOnce(new Error('IPC failure'));
        const result = await adapter.loadRegistry();
        expect(result).toEqual(DEFAULT_REGISTRY);
    });

    it('sets active vault via IPC and returns updated registry', async () => {
        const updatedRegistry: VaultRegistryData = {
            ...mockRegistry,
            activeVaultId: 'vault-2'
        };
        vi.mocked(window.electron.getVaultRegistry).mockResolvedValueOnce(updatedRegistry);
        const result = await adapter.setActiveVault('vault-2', mockRegistry);
        expect(window.electron.setActiveVault).toHaveBeenCalledWith('vault-2');
        expect(result.activeVaultId).toBe('vault-2');
    });

    it('adds a vault via IPC and returns the new vault and refreshed registry', async () => {
        const payload = { label: 'Added', url: 'http://192.168.1.60:8000', apiKey: 'key1' };
        const result = await adapter.addVault(payload, mockRegistry);
        expect(window.electron.addVault).toHaveBeenCalledWith(payload);
        expect(result.vault.label).toBe('Added');
        expect(result.registry).toEqual(mockRegistry);
    });

    it('updates a vault via IPC and returns the updated vault and fresh registry', async () => {
        const updates = { label: 'Updated' };
        const result = await adapter.updateVault('vault-2', updates, mockRegistry);
        expect(window.electron.updateVault).toHaveBeenCalledWith('vault-2', updates);
        expect(result.vault.label).toBe('Updated');
    });

    it('removes a vault via IPC and returns the new registry', async () => {
        const result = await adapter.removeVault('vault-2', mockRegistry);
        expect(window.electron.removeVault).toHaveBeenCalledWith('vault-2');
        expect(result.vaults.length).toBe(1);
    });

    it('delegates testConnection to window.electron.testVaultConnection', async () => {
        const result = await adapter.testConnection('http://remote:8000', 'secret');
        expect(window.electron.testVaultConnection).toHaveBeenCalledWith('http://remote:8000', 'secret');
        expect(result.success).toBe(true);
        expect(result.status).toBe('online');
    });

    it('delegates refreshHealth to window.electron.getVaultRegistry', async () => {
        const result = await adapter.refreshHealth(mockRegistry);
        expect(window.electron.getVaultRegistry).toHaveBeenCalled();
        expect(result).toEqual(mockRegistry);
    });

    it('subscribes to onVaultRegistryUpdated', () => {
        const callback = vi.fn();
        const unsubscribe = adapter.subscribeToUpdates(callback);
        expect(window.electron.onVaultRegistryUpdated).toHaveBeenCalledWith(callback);
        expect(typeof unsubscribe).toBe('function');
    });
});
