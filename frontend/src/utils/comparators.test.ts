/**
 * @file
 * Module: Comparators Utility Tests
 * Description: Unit tests for set folder size calculation and comparator sorting helpers.
 */
import { describe, it, expect } from 'vitest';
import { computeSetFolderSize, sortSets, type SortableSetItem } from './comparators';

const SIZE_100 = 100;
const SIZE_200 = 200;
const SIZE_300 = 300;
const SIZE_500 = 500;
const SIZE_50 = 50;

describe('comparators', () => {
    const mockSets: SortableSetItem[] = [
        {
            title: 'Bravo Set',
            date_added: '2026-01-02T00:00:00Z',
            images: [{ file_size: SIZE_100 }, { file_size: SIZE_200 }]
        },
        {
            title: 'Alpha Set',
            date_added: '2026-01-01T00:00:00Z',
            images: [{ file_size: SIZE_500 }]
        },
        {
            title: 'Charlie Set',
            date_added: '2026-01-03T00:00:00Z',
            images: [{ file_size: SIZE_50 }, { file_size: SIZE_50 }, { file_size: SIZE_50 }]
        }
    ];

    it('computes set folder size accurately', () => {
        expect(computeSetFolderSize(mockSets[0])).toBe(SIZE_300);
        expect(computeSetFolderSize(mockSets[1])).toBe(SIZE_500);
        expect(computeSetFolderSize({ images: [] })).toBe(0);
        expect(computeSetFolderSize({})).toBe(0);
    });

    it('sorts by title ascending and descending', () => {
        const asc = sortSets(mockSets, 'title_asc');
        expect(asc.map(s => s.title)).toEqual(['Alpha Set', 'Bravo Set', 'Charlie Set']);

        const desc = sortSets(mockSets, 'title_desc');
        expect(desc.map(s => s.title)).toEqual(['Charlie Set', 'Bravo Set', 'Alpha Set']);
    });

    it('sorts by date_added ascending and descending', () => {
        const asc = sortSets(mockSets, 'date_added_asc');
        expect(asc.map(s => s.title)).toEqual(['Alpha Set', 'Bravo Set', 'Charlie Set']);

        const desc = sortSets(mockSets, 'date_added_desc');
        expect(desc.map(s => s.title)).toEqual(['Charlie Set', 'Bravo Set', 'Alpha Set']);
    });

    it('sorts by image_count ascending and descending', () => {
        const asc = sortSets(mockSets, 'image_count_asc');
        expect(asc.map(s => s.title)).toEqual(['Alpha Set', 'Bravo Set', 'Charlie Set']);

        const desc = sortSets(mockSets, 'image_count_desc');
        expect(desc.map(s => s.title)).toEqual(['Charlie Set', 'Bravo Set', 'Alpha Set']);
    });

    it('sorts by folder_size ascending and descending with precomputed sizes', () => {
        const asc = sortSets(mockSets, 'folder_size_asc');
        expect(asc.map(s => s.title)).toEqual(['Charlie Set', 'Bravo Set', 'Alpha Set']);

        const desc = sortSets(mockSets, 'folder_size_desc');
        expect(desc.map(s => s.title)).toEqual(['Alpha Set', 'Bravo Set', 'Charlie Set']);
    });

    it('returns unmodified array when unknown sort key provided', () => {
        const unchanged = sortSets(mockSets, 'unknown_key');
        expect(unchanged).toEqual(mockSets);
    });
});
