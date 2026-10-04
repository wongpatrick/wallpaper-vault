/**
 * @file
 * Module: useGalleryStream hook
 * Description: Manages infinite scroll stream, viewport-based responsive column layout, and local collection state for wallpaper gallery.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useIntersection, useViewportSize } from '@mantine/hooks';
import type { Image as ImageModel } from '../../../api/model';
import type { WithMultiVault } from '../../../types/vault';

const PAGE_SIZE = 100;
const BREAKPOINT_SM = 600;
const BREAKPOINT_MD = 900;
const BREAKPOINT_LG = 1200;
const SENTINEL_THRESHOLD = 0;

interface UseGalleryStreamOptions {
    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
    pageData?: { items?: ImageModel[]; total?: number };
    isLoading: boolean;
    isFetching: boolean;
    onImageRemoved?: (id: number) => void;
}

export function useGalleryStream({
    page,
    setPage,
    pageData,
    isLoading,
    isFetching,
    onImageRemoved,
}: UseGalleryStreamOptions) {
    const [allImages, setAllImages] = useState<ImageModel[]>([]);
    const [hasMore, setHasMore] = useState(true);

    const handleFilterReset = useCallback(() => {
        setAllImages([]);
        setHasMore(true);
    }, []);

    const { width } = useViewportSize();
    const columnCount = useMemo(() => {
        if (width < BREAKPOINT_SM) return 1;
        if (width < BREAKPOINT_MD) return 2;
        if (width < BREAKPOINT_LG) return 3;
        return 4;
    }, [width]);

    const columns = useMemo(() => {
        const cols: { originalIdx: number; image: ImageModel }[][] = Array.from({ length: columnCount }, () => []);
        allImages.forEach((img, idx) => {
            cols[idx % columnCount].push({ originalIdx: idx, image: img });
        });
        return cols;
    }, [allImages, columnCount]);

    const { ref: sentinelRef, entry } = useIntersection({
        threshold: SENTINEL_THRESHOLD,
        rootMargin: '1200px',
    });

    const handleCollectionReset = useCallback(() => {
        setAllImages([]);
        setPage(1);
    }, [setPage]);

    const handleDeleteImage = useCallback((deletedId: number) => {
        setAllImages(prev => prev.filter(img => img.id !== deletedId));
        onImageRemoved?.(deletedId);
    }, [onImageRemoved]);

    useEffect(() => {
        if (pageData?.items) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setAllImages(prev => {
                if (page === 1) return pageData.items!;
                const next = [...prev];
                pageData.items!.forEach(newItem => {
                    const newMulti = newItem as WithMultiVault<ImageModel>;
                    const newKey = `${newMulti._vaultId || 'local'}-${newMulti.id}`;
                    const idx = next.findIndex(img => {
                        const imgMulti = img as WithMultiVault<ImageModel>;
                        return `${imgMulti._vaultId || 'local'}-${imgMulti.id}` === newKey;
                    });
                    if (idx !== -1) next[idx] = newItem;
                    else next.push(newItem);
                });
                return next;
            });
            setHasMore(pageData.items.length === PAGE_SIZE);
        }
    }, [pageData, page]);

    useEffect(() => {
        if (entry?.isIntersecting && hasMore && !isFetching && !isLoading && allImages.length > 0) {
            setPage(prev => prev + 1);
        }
    }, [entry?.isIntersecting, hasMore, isFetching, isLoading, allImages.length, setPage]);

    return {
        allImages,
        columns,
        columnCount,
        hasMore,
        sentinelRef,
        handleFilterReset,
        handleCollectionReset,
        handleDeleteImage,
    };
}
