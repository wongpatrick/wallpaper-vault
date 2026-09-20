/**
 * @file
 * Unit tests for multiVaultSort utilities.
 */
/* eslint-disable no-magic-numbers */
import { describe, expect, it } from 'vitest';
import { getSortValue, sortItems } from './multiVaultSort';

describe('multiVaultSort', () => {
    describe('getSortValue', () => {
        it('returns empty string when item or sortBy is missing', () => {
            expect(getSortValue(undefined, 'name')).toBe('');
            expect(getSortValue(null, 'name')).toBe('');
            expect(getSortValue({ name: 'Test' }, undefined)).toBe('');
            expect(getSortValue({ name: 'Test' }, '')).toBe('');
        });

        it('resolves name polymorphically across canonical_name, name, and title', () => {
            expect(getSortValue({ canonical_name: 'Canon' }, 'name')).toBe('Canon');
            expect(getSortValue({ name: 'Regular' }, 'name')).toBe('Regular');
            expect(getSortValue({ title: 'Set Title' }, 'name')).toBe('Set Title');
            expect(getSortValue({ canonical_name: 'Canon', name: 'Regular' }, 'name')).toBe('Canon');
        });

        it('resolves image_count from images array or image_count property', () => {
            expect(getSortValue({ images: [1, 2, 3] }, 'image_count')).toBe(3);
            expect(getSortValue({ image_count: 5 }, 'image_count')).toBe(5);
            expect(getSortValue({ images: [1], image_count: 10 }, 'image_count')).toBe(1);
            expect(getSortValue({}, 'image_count')).toBe(0);
        });

        it('resolves set_count from stats or set_count property', () => {
            expect(getSortValue({ stats: { total_sets: 8 } }, 'set_count')).toBe(8);
            expect(getSortValue({ set_count: 4 }, 'set_count')).toBe(4);
            expect(getSortValue({}, 'set_count')).toBe(0);
        });

        it('resolves total_image_count from stats or total_image_count property', () => {
            expect(getSortValue({ stats: { total_images: 42 } }, 'total_image_count')).toBe(42);
            expect(getSortValue({ total_image_count: 17 }, 'total_image_count')).toBe(17);
            expect(getSortValue({}, 'total_image_count')).toBe(0);
        });

        it('resolves arbitrary string or number properties', () => {
            expect(getSortValue({ date_added: '2026-01-01' }, 'date_added')).toBe('2026-01-01');
            expect(getSortValue({ rating: 5 }, 'rating')).toBe(5);
            expect(getSortValue({ custom_obj: { nested: true } }, 'custom_obj')).toBe('');
        });
    });

    describe('sortItems', () => {
        it('returns original items array if sortBy is omitted', () => {
            const items = [{ id: 1 }, { id: 2 }];
            expect(sortItems(items)).toEqual(items);
        });

        it('sorts numeric properties descending and ascending', () => {
            const items = [{ id: 1, rating: 2 }, { id: 2, rating: 5 }, { id: 3, rating: 1 }];

            const desc = sortItems(items, 'rating', 'desc');
            expect(desc.map(i => i.id)).toEqual([2, 1, 3]);

            const asc = sortItems(items, 'rating', 'asc');
            expect(asc.map(i => i.id)).toEqual([3, 1, 2]);
        });

        it('sorts strings using natural numeric comparison', () => {
            const items = [
                { id: 1, title: 'Item 10' },
                { id: 2, title: 'Item 2' },
                { id: 3, title: 'Item 1' }
            ];

            const asc = sortItems(items, 'name', 'asc');
            expect(asc.map(i => i.title)).toEqual(['Item 1', 'Item 2', 'Item 10']);

            const desc = sortItems(items, 'name', 'desc');
            expect(desc.map(i => i.title)).toEqual(['Item 10', 'Item 2', 'Item 1']);
        });

        it('does not mutate the original array', () => {
            const items = [{ id: 1, rating: 2 }, { id: 2, rating: 5 }];
            const originalCopy = [...items];
            sortItems(items, 'rating', 'desc');
            expect(items).toEqual(originalCopy);
        });
    });
});
