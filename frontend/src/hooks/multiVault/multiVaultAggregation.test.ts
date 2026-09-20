/**
 * @file
 * Unit tests for multiVaultAggregation pure merge functions.
 */
/* eslint-disable no-magic-numbers */
import { describe, expect, it } from 'vitest';
import type { Character, LibraryStats, TagCount } from '../../api/model';
import {
    mergeDashboardStats,
    mergePaginatedResults,
    mergeTagCloudItems,
    mergeTaxonomyItems
} from './multiVaultAggregation';
import type { VaultEntry } from './types';

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

describe('multiVaultAggregation', () => {
    describe('mergePaginatedResults', () => {
        interface MockItem {
            id: number;
            title: string;
            date_added: string;
        }

        it('merges paginated results, decorates items, and sorts them properly', () => {
            const vault1Sets: MockItem[] = [
                {
                    id: 1,
                    title: 'Set A',
                    date_added: '2026-01-02T00:00:00Z'
                },
                {
                    id: 2,
                    title: 'Set C',
                    date_added: '2026-01-04T00:00:00Z'
                }
            ];

            const vault2Sets: MockItem[] = [
                {
                    id: 3,
                    title: 'Set B',
                    date_added: '2026-01-03T00:00:00Z'
                }
            ];

            const merged = mergePaginatedResults(
                [
                    { data: { items: vault1Sets, total: 2 }, vault: mockOnlineVaults[0] },
                    { data: { items: vault2Sets, total: 1 }, vault: mockOnlineVaults[1] }
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

        it('handles non-zero skip and limit slicing', () => {
            const vault1Sets: MockItem[] = [
                { id: 1, title: 'Set 1', date_added: '2026-01-01T00:00:00Z' },
                { id: 2, title: 'Set 2', date_added: '2026-01-02T00:00:00Z' }
            ];
            const vault2Sets: MockItem[] = [
                { id: 3, title: 'Set 3', date_added: '2026-01-03T00:00:00Z' },
                { id: 4, title: 'Set 4', date_added: '2026-01-04T00:00:00Z' }
            ];

            const merged = mergePaginatedResults(
                [
                    { data: { items: vault1Sets, total: 2 }, vault: mockOnlineVaults[0] },
                    { data: { items: vault2Sets, total: 2 }, vault: mockOnlineVaults[1] }
                ],
                'date_added',
                'desc',
                1,
                2
            );

            expect(merged.total).toBe(4);
            // All sorted desc: [4, 3, 2, 1]. Slice(1, 1+2) => [3, 2]
            expect(merged.items.map(s => s.id)).toEqual([3, 2]);
            expect(merged.skip).toBe(1);
            expect(merged.limit).toBe(2);
        });
    });

    describe('mergeDashboardStats', () => {
        it('merges dashboard stats across multiple responses', () => {
            const s1: LibraryStats = {
                total_sets: 10,
                total_images: 100,
                total_creators: 5,
                total_size_bytes: 1000000,
                database_size_bytes: 50000,
                aspect_ratio_distribution: { '16:9': 60, '21:9': 40 }
            };

            const s2: LibraryStats = {
                total_sets: 20,
                total_images: 200,
                total_creators: 15,
                total_size_bytes: 2000000,
                database_size_bytes: 70000,
                aspect_ratio_distribution: { '16:9': 100, '4:3': 100 }
            };

            const merged = mergeDashboardStats([
                { stats: s1, vault: mockOnlineVaults[0] },
                { stats: s2, vault: mockOnlineVaults[1] }
            ]);

            expect(merged.total_sets).toBe(30);
            expect(merged.total_images).toBe(300);
            expect(merged.total_creators).toBe(20);
            expect(merged.total_size_bytes).toBe(3000000);
            expect(merged.aspect_ratio_distribution).toEqual({
                '16:9': 160,
                '21:9': 40,
                '4:3': 100
            });
        });
    });

    describe('mergeTagCloudItems', () => {
        it('merges tag cloud items and sums identical tags', () => {
            const cloud1: TagCount[] = [
                { tag: 'cyberpunk', count: 10, type: 'tag' },
                { tag: 'neon', count: 5, type: 'tag' }
            ];
            const cloud2: TagCount[] = [
                { tag: 'cyberpunk', count: 15, type: 'tag' },
                { tag: 'retro', count: 8, type: 'tag' }
            ];

            const merged = mergeTagCloudItems([cloud1, cloud2]);
            expect(merged.length).toBe(3);
            const cyberpunk = merged.find(t => t.tag === 'cyberpunk');
            expect(cyberpunk?.count).toBe(25);
        });

        it('respects the limit argument', () => {
            const list: TagCount[] = [
                { tag: 'a', count: 10 },
                { tag: 'b', count: 20 },
                { tag: 'c', count: 5 }
            ];
            const merged = mergeTagCloudItems([list], 2);
            expect(merged.length).toBe(2);
            expect(merged[0].tag).toBe('b');
            expect(merged[1].tag).toBe('a');
        });
    });

    describe('mergeTaxonomyItems', () => {
        it('merges characters deduplicating case-insensitively and summing counts', () => {
            const c1: Character[] = [
                { id: 1, name: 'Asuka Langley', image_count: 5, set_count: 2 },
                { id: 2, name: 'Rei Ayanami', image_count: 3, set_count: 1 }
            ];
            const c2: Character[] = [
                { id: 3, name: 'asuka langley', image_count: 10, set_count: 3 },
                { id: 4, name: 'Shinji Ikari', image_count: 2, set_count: 1 }
            ];

            const result = mergeTaxonomyItems([
                { data: { items: c1, total: 2 } },
                { data: { items: c2, total: 2 } }
            ]);

            expect(result.total).toBe(4);
            expect(result.items.length).toBe(3);
            const asuka = result.items.find(i => i.name.toLowerCase() === 'asuka langley');
            expect(asuka?.image_count).toBe(15);
            expect(asuka?.set_count).toBe(5);
        });

        it('handles empty input gracefully', () => {
            const result = mergeTaxonomyItems([]);
            expect(result.items).toEqual([]);
            expect(result.total).toBe(0);
        });
    });
});
