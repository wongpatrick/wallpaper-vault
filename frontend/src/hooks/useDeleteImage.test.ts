/**
 * @file
 * Tests for useDeleteImage hook.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeleteImage } from './useDeleteImage';

const mockMutateAsync = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockRemoveQueries = vi.fn();

vi.mock('../api/generated/images/images', () => ({
    useDeleteImageApiImagesImageIdDelete: () => ({
        mutateAsync: mockMutateAsync,
        isPending: false,
    }),
}));

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({
        invalidateQueries: mockInvalidateQueries,
        removeQueries: mockRemoveQueries,
    }),
}));

describe('useDeleteImage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('deletes image by numeric ID and invalidates cache', async () => {
        mockMutateAsync.mockResolvedValueOnce({});
        const onSuccess = vi.fn();

        const { result } = renderHook(() => useDeleteImage({ onSuccess }));

        await act(async () => {
            await result.current.deleteImage(42);
        });

        expect(mockMutateAsync).toHaveBeenCalledWith({ imageId: 42 });
        expect(result.current.deletedImageId).toBe(42);
        expect(onSuccess).toHaveBeenCalledWith(42);

        expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
        const invalidatePredicate = mockInvalidateQueries.mock.calls[0][0].predicate;
        expect(invalidatePredicate({ queryKey: ['images'] })).toBe(true);
        expect(invalidatePredicate({ queryKey: ['sets'] })).toBe(true);
        expect(invalidatePredicate({ queryKey: ['dashboard'] })).toBe(true);
        expect(invalidatePredicate({ queryKey: ['creators'] })).toBe(false);

        expect(mockRemoveQueries).toHaveBeenCalledTimes(1);
        const removePredicate = mockRemoveQueries.mock.calls[0][0].predicate;
        expect(removePredicate({ queryKey: ['/api/images/42'] })).toBe(true);
        expect(removePredicate({ queryKey: ['/api/images/42/details'] })).toBe(true);
        expect(removePredicate({ queryKey: ['/api/images/99'] })).toBe(false);
    });

    it('deletes image by object target', async () => {
        mockMutateAsync.mockResolvedValueOnce({});

        const { result } = renderHook(() => useDeleteImage());

        await act(async () => {
            await result.current.deleteImage({ id: 101 });
        });

        expect(mockMutateAsync).toHaveBeenCalledWith({ imageId: 101 });
        expect(result.current.deletedImageId).toBe(101);
    });

    it('handles deletion error and triggers onError callback', async () => {
        const error = new Error('Deletion failed');
        mockMutateAsync.mockRejectedValueOnce(error);
        const onError = vi.fn();

        const { result } = renderHook(() => useDeleteImage({ onError }));

        await expect(act(async () => {
            await result.current.deleteImage(55);
        })).rejects.toThrow('Deletion failed');

        expect(onError).toHaveBeenCalledWith(error, 55);
        expect(mockInvalidateQueries).not.toHaveBeenCalled();
    });
});
