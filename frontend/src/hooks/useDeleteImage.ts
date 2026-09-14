/**
 * @file
 * Hook for image deletion with comprehensive React Query cache invalidation.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeleteImageApiImagesImageIdDelete } from '../api/generated/images/images';
import { useVault } from './useVault';
import type { Image as ImageModel } from '../api/model';
import type { WithMultiVault } from '../types/vault';

interface UseDeleteImageOptions {
    onSuccess?: (imageId: number) => void;
}

export function useDeleteImage(options?: UseDeleteImageOptions) {
    const queryClient = useQueryClient();
    const deleteMutation = useDeleteImageApiImagesImageIdDelete();
    const { isAggregated, activeVault, switchVault } = useVault();
    const [deletedImageId, setDeletedImageId] = useState<number | null>(null);

    const deleteImage = useCallback(
        async (targetImage: ImageModel | WithMultiVault<ImageModel> | number) => {
            const imageId = typeof targetImage === 'number' ? targetImage : targetImage.id;
            const multiImage = typeof targetImage === 'object' ? (targetImage as WithMultiVault<ImageModel>) : null;

            if (isAggregated && multiImage?._vaultId && activeVault.id !== multiImage._vaultId) {
                await switchVault(multiImage._vaultId);
            }

            await deleteMutation.mutateAsync({ imageId });
            setDeletedImageId(imageId);

            // Invalidate React Query caches for images, sets, and dashboard
            queryClient.invalidateQueries({
                predicate: (query) => {
                    const key0 = query.queryKey[0];
                    const key1 = query.queryKey[1];

                    const isMatch = (target: string) => {
                        if (typeof key0 === 'string') {
                            if (key0 === target || key0.startsWith(`/api/${target}`)) return true;
                            if (key0 === 'multi-vault' && typeof key1 === 'string' && (key1 === target || key1.startsWith(`/api/${target}`))) {
                                return true;
                            }
                        }
                        return false;
                    };

                    return isMatch('images') || isMatch('sets') || isMatch('dashboard');
                },
            });

            // Remove specific image detail query
            queryClient.removeQueries({
                predicate: (query) => {
                    const key0 = query.queryKey[0];
                    return typeof key0 === 'string' && (key0 === `/api/images/${imageId}` || key0.startsWith(`/api/images/${imageId}/`));
                },
            });

            options?.onSuccess?.(imageId);
        },
        [deleteMutation, isAggregated, activeVault.id, switchVault, queryClient, options]
    );

    return {
        deleteImage,
        deletedImageId,
        isDeleting: deleteMutation.isPending,
    };
}