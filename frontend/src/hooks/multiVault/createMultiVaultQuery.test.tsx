/**
 * @file
 * Unit tests for multi-vault query hooks, partial error tracking, and fetch transport.
 */
/* eslint-disable no-magic-numbers */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMultiVaultSets } from './index';
import { fetchFromVault } from './fetchFromVault';
import * as VaultHook from '../useVault';
import { AXIOS_INSTANCE } from '../../api/axios-instance';
import type { VaultEntry } from './types';

// Mock useVault
vi.mock('../useVault', () => ({
    useVault: vi.fn()
}));

// Mock AXIOS_INSTANCE
vi.mock('../../api/axios-instance', () => ({
    AXIOS_INSTANCE: {
        get: vi.fn(),
        defaults: { baseURL: 'http://localhost:8000' }
    }
}));

const mockOnlineVaults: VaultEntry[] = [
    {
        id: 'local',
        label: 'Local Vault',
        url: 'http://localhost:8000',
        status: 'online',
        isLocal: true
    },
    {
        id: 'remote-1',
        label: 'Remote Server',
        url: 'http://192.168.1.50:8000',
        status: 'online',
        isLocal: false,
        apiKey: 'secret-key-1'
    }
];

const mockAllVaults: VaultEntry[] = [
    ...mockOnlineVaults,
    {
        id: 'remote-offline',
        label: 'Offline Vault',
        url: 'http://192.168.1.99:8000',
        status: 'offline',
        isLocal: false
    }
];

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: 0
            }
        }
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
}

describe('fetchFromVault', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends explicit apiKey header when apiKey is present', async () => {
        vi.mocked(AXIOS_INSTANCE.get).mockResolvedValueOnce({ data: { ok: true } });

        const vaultWithKey: VaultEntry = {
            id: 'remote-1',
            label: 'Remote 1',
            url: 'http://192.168.1.100:8000',
            isLocal: false,
            apiKey: 'my-secret-key'
        };

        await fetchFromVault(vaultWithKey, '/api/stats');

        expect(AXIOS_INSTANCE.get).toHaveBeenCalledWith(
            'http://192.168.1.100:8000/api/stats',
            expect.objectContaining({
                headers: { 'X-API-Key': 'my-secret-key' },
                skipAuthInterceptor: true
            })
        );
    });

    it('sends empty string apiKey header when apiKey is undefined/empty', async () => {
        vi.mocked(AXIOS_INSTANCE.get).mockResolvedValueOnce({ data: { ok: true } });

        const vaultWithoutKey: VaultEntry = {
            id: 'remote-no-key',
            label: 'Remote No Key',
            url: 'http://192.168.1.101:8000',
            isLocal: false
        };

        await fetchFromVault(vaultWithoutKey, '/api/stats');

        expect(AXIOS_INSTANCE.get).toHaveBeenCalledWith(
            'http://192.168.1.101:8000/api/stats',
            expect.objectContaining({
                headers: { 'X-API-Key': '' },
                skipAuthInterceptor: true
            })
        );
    });
});

describe('useMultiVaultSets hook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('queries all online vaults in aggregated mode and merges items', async () => {
        vi.mocked(VaultHook.useVault).mockReturnValue({
            isAggregated: true,
            onlineVaults: mockOnlineVaults,
            vaults: mockAllVaults,
            activeVault: mockOnlineVaults[0],
            switchVault: vi.fn(),
            refreshVaults: vi.fn(),
            addVault: vi.fn(),
            updateVault: vi.fn(),
            removeVault: vi.fn(),
            setAggregated: vi.fn()
        } as unknown as ReturnType<typeof VaultHook.useVault>);

        vi.mocked(AXIOS_INSTANCE.get).mockImplementation(async (url: string) => {
            if (url.includes('localhost')) {
                return {
                    data: {
                        items: [
                            { id: 10, title: 'Local Set', date_added: '2026-01-01T00:00:00Z' }
                        ],
                        total: 1
                    }
                };
            }
            return {
                data: {
                    items: [
                        { id: 20, title: 'Remote Set', date_added: '2026-01-05T00:00:00Z' }
                    ],
                    total: 1
                }
            };
        });

        const { result } = renderHook(
            () => useMultiVaultSets({ sort_by: 'date_added', sort_dir: 'desc' }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
            expect(result.current.data?.total).toBe(2);
        });

        expect(result.current.data?.items[0].id).toBe(20);
        expect(result.current.data?.items[0]._vaultLabel).toBe('Remote Server');
        expect(result.current.data?.items[1].id).toBe(10);
        expect(result.current.data?.items[1]._vaultLabel).toBe('Local Vault');
        expect(result.current.isAggregated).toBe(true);
        expect(result.current.onlineCount).toBe(2);
        expect(result.current.totalVaultsCount).toBe(3);
        expect(result.current.offlineVaults.length).toBe(1);
        expect(result.current.partialErrors).toEqual([]);
    });

    it('resiliently handles a failing vault in aggregated mode and captures partialErrors', async () => {
        vi.mocked(VaultHook.useVault).mockReturnValue({
            isAggregated: true,
            onlineVaults: mockOnlineVaults,
            vaults: mockAllVaults,
            activeVault: mockOnlineVaults[0],
            switchVault: vi.fn(),
            refreshVaults: vi.fn(),
            addVault: vi.fn(),
            updateVault: vi.fn(),
            removeVault: vi.fn(),
            setAggregated: vi.fn()
        } as unknown as ReturnType<typeof VaultHook.useVault>);

        vi.mocked(AXIOS_INSTANCE.get).mockImplementation(async (url: string) => {
            if (url.includes('localhost')) {
                return {
                    data: {
                        items: [
                            { id: 10, title: 'Local Set', date_added: '2026-01-01T00:00:00Z' }
                        ],
                        total: 1
                    }
                };
            }
            throw new Error('Network timeout connecting to remote vault');
        });

        const { result } = renderHook(
            () => useMultiVaultSets({ sort_by: 'date_added', sort_dir: 'desc' }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
            expect(result.current.data?.total).toBe(1);
        });

        expect(result.current.data?.items[0].id).toBe(10);
        expect(result.current.partialErrors.length).toBe(1);
        expect(result.current.partialErrors[0].vaultId).toBe('remote-1');
        expect(result.current.partialErrors[0].vaultLabel).toBe('Remote Server');
        expect(result.current.partialErrors[0].error.message).toContain('Network timeout');
    });

    it('operates in single-vault mode when isAggregated is false', async () => {
        vi.mocked(VaultHook.useVault).mockReturnValue({
            isAggregated: false,
            onlineVaults: mockOnlineVaults,
            vaults: mockAllVaults,
            activeVault: mockOnlineVaults[0],
            switchVault: vi.fn(),
            refreshVaults: vi.fn(),
            addVault: vi.fn(),
            updateVault: vi.fn(),
            removeVault: vi.fn(),
            setAggregated: vi.fn()
        } as unknown as ReturnType<typeof VaultHook.useVault>);

        vi.mocked(AXIOS_INSTANCE.get).mockResolvedValueOnce({
            data: {
                items: [
                    { id: 10, title: 'Local Only', date_added: '2026-01-01T00:00:00Z' }
                ],
                total: 1
            }
        });

        const { result } = renderHook(
            () => useMultiVaultSets({ sort_by: 'date_added', sort_dir: 'desc' }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
            expect(result.current.data?.total).toBe(1);
        });

        expect(AXIOS_INSTANCE.get).toHaveBeenCalledTimes(1);
        expect(result.current.isAggregated).toBe(false);
        expect(result.current.partialErrors).toEqual([]);
    });

    it('sets error state when all online vaults fail in aggregated mode', async () => {
        vi.mocked(VaultHook.useVault).mockReturnValue({
            isAggregated: true,
            onlineVaults: mockOnlineVaults,
            vaults: mockAllVaults,
            activeVault: mockOnlineVaults[0],
            switchVault: vi.fn(),
            refreshVaults: vi.fn(),
            addVault: vi.fn(),
            updateVault: vi.fn(),
            removeVault: vi.fn(),
            setAggregated: vi.fn()
        } as unknown as ReturnType<typeof VaultHook.useVault>);

        vi.mocked(AXIOS_INSTANCE.get).mockRejectedValue(new Error('Connection refused'));

        const { result } = renderHook(
            () => useMultiVaultSets({ sort_by: 'date_added', sort_dir: 'desc' }),
            { wrapper: createWrapper() }
        );

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).not.toBeNull();
        });

        expect(result.current.error?.message).toBe('Connection refused');
    });
});
