/**
 * @file
 * Unit tests for multi-vault query hooks and merge utilities.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { 
    useMultiVaultSets, 
    mergePaginatedResults,
    mergeDashboardStats,
    mergeTagCloudItems,
    fetchFromVault
} from './useMultiVaultQuery';
import * as VaultHook from './useVault';
import { AXIOS_INSTANCE } from '../api/axios-instance';
import type { VaultEntry } from '../types/vault';
import type { Set, LibraryStats, TagCount } from '../api/model';



// Mock useVault
vi.mock('./useVault', () => ({
    useVault: vi.fn(),
}));

// Mock AXIOS_INSTANCE
vi.mock('../api/axios-instance', () => ({
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
        isLocal: true,
    },
    {
        id: 'remote-1',
        label: 'Remote Server',
        url: 'http://192.168.1.50:8000',
        status: 'online',
        isLocal: false,
        apiKey: 'secret-key-1',
    },
];

const mockAllVaults: VaultEntry[] = [
    ...mockOnlineVaults,
    {
        id: 'remote-offline',
        label: 'Offline Vault',
        url: 'http://192.168.1.99:8000',
        status: 'offline',
        isLocal: false,
    }
];

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: 0,
            },
        },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
}

describe('useMultiVaultQuery pure helpers', () => {
    it('merges paginated results and sorts them properly', () => {
        const vault1Sets: Set[] = [
            {
                id: 1,
                title: 'Set A',
                date_added: '2026-01-02T00:00:00Z',
            } as Set,
            {
                id: 2,
                title: 'Set C',
                date_added: '2026-01-04T00:00:00Z',
            } as Set,
        ];

        const vault2Sets: Set[] = [
            {
                id: 3,
                title: 'Set B',
                date_added: '2026-01-03T00:00:00Z',
            } as Set,
        ];

        const merged = mergePaginatedResults(
            [
                { data: { items: vault1Sets, total: 2 }, vault: mockOnlineVaults[0] },
                { data: { items: vault2Sets, total: 1 }, vault: mockOnlineVaults[1] },
            ],
            'date_added',
            'desc',
            0,
            10
        );

        expect(merged.total).toBe(3);
        expect(merged.items.map(s => s.id)).toEqual([2, 3, 1]);
        expect(merged.items[0]._vaultLabel).toBe('Local Vault');
        expect(merged.items[1]._vaultLabel).toBe('Remote Server');
    });

    it('merges dashboard stats across multiple responses', () => {
        const s1: LibraryStats = {
            total_sets: 10,
            total_images: 100,
            total_creators: 5,
            total_size_bytes: 1000000,
            database_size_bytes: 50000,
            aspect_ratio_distribution: { '16:9': 60, '21:9': 40 },
        };

        const s2: LibraryStats = {
            total_sets: 20,
            total_images: 200,
            total_creators: 15,
            total_size_bytes: 2000000,
            database_size_bytes: 70000,
            aspect_ratio_distribution: { '16:9': 100, '4:3': 100 },
        };

        const merged = mergeDashboardStats([
            { stats: s1, vault: mockOnlineVaults[0] },
            { stats: s2, vault: mockOnlineVaults[1] },
        ]);

        expect(merged.total_sets).toBe(30);
        expect(merged.total_images).toBe(300);
        expect(merged.total_creators).toBe(20);
        expect(merged.total_size_bytes).toBe(3000000);
        expect(merged.aspect_ratio_distribution).toEqual({
            '16:9': 160,
            '21:9': 40,
            '4:3': 100,
        });
    });

    it('merges tag cloud items and sums identical tags', () => {
        const cloud1: TagCount[] = [
            { tag: 'cyberpunk', count: 10, type: 'tag' },
            { tag: 'neon', count: 5, type: 'tag' },
        ];
        const cloud2: TagCount[] = [
            { tag: 'cyberpunk', count: 15, type: 'tag' },
            { tag: 'retro', count: 8, type: 'tag' },
        ];

        const merged = mergeTagCloudItems([cloud1, cloud2]);
        expect(merged.length).toBe(3);
        const cyberpunk = merged.find(t => t.tag === 'cyberpunk');
        expect(cyberpunk?.count).toBe(25);
    });
});


describe('useMultiVaultSets hook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('queries all online vaults in aggregated mode and merges items', async () => {
        (VaultHook.useVault as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            isAggregated: true,
            onlineVaults: mockOnlineVaults,
            vaults: mockAllVaults,
            activeVault: mockOnlineVaults[0],
            switchVault: vi.fn(),
        });

        (AXIOS_INSTANCE.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
            if (url.includes('localhost')) {
                return {
                    data: {
                        items: [
                            { id: 10, title: 'Local Set', date_added: '2026-01-01T00:00:00Z' }
                        ],
                        total: 1,
                    }
                };
            } else {
                return {
                    data: {
                        items: [
                            { id: 20, title: 'Remote Set', date_added: '2026-01-05T00:00:00Z' }
                        ],
                        total: 1,
                    }
                };
            }
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
    });

    it('resiliently handles a failing vault in aggregated mode', async () => {
        (VaultHook.useVault as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            isAggregated: true,
            onlineVaults: mockOnlineVaults,
            vaults: mockAllVaults,
            activeVault: mockOnlineVaults[0],
            switchVault: vi.fn(),
        });

        // Local succeeds, Remote rejects
        (AXIOS_INSTANCE.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
            if (url.includes('localhost')) {
                return {
                    data: {
                        items: [
                            { id: 10, title: 'Local Set', date_added: '2026-01-01T00:00:00Z' }
                        ],
                        total: 1,
                    }
                };
            } else {
                throw new Error('Network error on remote vault');
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

        expect(result.current.data?.items[0].id).toBe(10);
    });

    describe('fetchFromVault', () => {
        it('sends explicit apiKey header when apiKey is present', async () => {
            (AXIOS_INSTANCE.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { ok: true } });

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
            (AXIOS_INSTANCE.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { ok: true } });

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
});

