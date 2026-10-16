/**
 * @file
 * Hook for image deletion with comprehensive React Query cache invalidation.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeleteImageApiImagesImageIdDelete } from '../api/generated/images/images';
import { matchesAnyEndpoint } from '../utils/queryKeyMatchers';

export interface UseDeleteImageOptions {
    onSuccess?: (imageId: number) => void;
    onError?: (error: unknown, imageId: number) => void;
}

export type DeleteImageTarget = number | { id: number };

export function useDeleteImage(options?: UseDeleteImageOptions) {
    const queryClient = useQueryClient();
    const deleteMutation = useDeleteImageApiImagesImageIdDelete();
    const [deletedImageId, setDeletedImageId] = useState<number | null>(null);

    const deleteImage = useCallback(
        async (targetImage: DeleteImageTarget) => {
            const imageId = typeof targetImage === 'number' ? targetImage : targetImage.id;

            try {
                await deleteMutation.mutateAsync({ imageId });
                setDeletedImageId(imageId);

                // Invalidate React Query caches for images, sets, and dashboard
                queryClient.invalidateQueries({
                    predicate: (query) => matchesAnyEndpoint(query.queryKey, ['images', 'sets', 'dashboard']),
                });

                // Remove specific image detail query
                queryClient.removeQueries({
                    predicate: (query) => {
                        const key0 = query.queryKey[0];
                        return typeof key0 === 'string' && (key0 === `/api/images/${imageId}` || key0.startsWith(`/api/images/${imageId}/`));
                    },
                });

                options?.onSuccess?.(imageId);
            } catch (err) {
                options?.onError?.(err, imageId);
                throw err;
            }
        },
        [deleteMutation, queryClient, options]
    );

    return {
        deleteImage,
        deletedImageId,
        isDeleting: deleteMutation.isPending,
    };
}