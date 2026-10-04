/**
 * @file
 * Module: Image Grid Component
 * Description: Displays a responsive virtualized masonry grid of wallpapers with selection support and infinite scroll sentinel.
 */
import React, { useRef, useState, useEffect } from 'react';
import { Box, Center, Loader, Alert, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { ImageGridItem } from './ImageGridItem';
import type { Image as ImageModel } from '../../api/model';

export interface ImageGridSelection {
    mode: boolean;
    selectedIds: Set<number>;
    onToggle: (id: number) => void;
}

export interface ImageGridPaginationStatus {
    isLoading: boolean;
    isFetching: boolean;
    hasMore: boolean;
    page: number;
    error: unknown;
}

export interface ImageGridProps {
    allImages: ImageModel[];
    columns: { originalIdx: number; image: ImageModel }[][];
    columnCount: number;
    sentinelRef: (element: HTMLElement | null) => void;
    selection: ImageGridSelection;
    status: ImageGridPaginationStatus;
    onImageClick: (originalIdx: number) => void;
    onSetWallpaper?: (image: ImageModel) => void;
    isAggregated?: boolean;
}

interface VirtualColumnProps {
    items: { originalIdx: number; image: ImageModel }[];
    parentOffsetTop: number;
    selection: ImageGridSelection;
    onImageClick: (originalIdx: number) => void;
    onSetWallpaper?: (image: ImageModel) => void;
    isAggregated?: boolean;
}

const ESTIMATED_ITEM_HEIGHT = 260;
const ITEM_PADDING_BOTTOM_PX = 16;
const DEFAULT_COLUMN_WIDTH_PX = 300;
const SENTINEL_HEIGHT_PX = 100;
const LOADING_CENTER_PY = 100;
const VIRTUALIZER_OVERSCAN = 5;

const VirtualColumn = React.memo(function VirtualColumn({
    items,
    parentOffsetTop,
    selection,
    onImageClick,
    onSetWallpaper,
    isAggregated,
}: VirtualColumnProps) {
    const virtualizer = useWindowVirtualizer({
        count: items.length,
        estimateSize: (index) => {
            const img = items[index]?.image;
            if (img?.width && img?.height) {
                return Math.round((img.height / img.width) * DEFAULT_COLUMN_WIDTH_PX) + ITEM_PADDING_BOTTOM_PX;
            }
            return ESTIMATED_ITEM_HEIGHT;
        },
        overscan: VIRTUALIZER_OVERSCAN,
        scrollMargin: parentOffsetTop,
        getItemKey: (index) => items[index]?.image.id ?? index,
    });

    return (
        <div
            style={{
                position: 'relative',
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
            }}
        >
            {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = items[virtualRow.index];
                if (!item) return null;
                return (
                    <div
                        key={virtualRow.key}
                        ref={virtualizer.measureElement}
                        data-index={virtualRow.index}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start - (virtualizer.options.scrollMargin ?? 0)}px)`,
                            paddingBottom: `${ITEM_PADDING_BOTTOM_PX}px`,
                        }}
                    >
                        <ImageGridItem
                            image={item.image}
                            originalIndex={item.originalIdx}
                            onClick={onImageClick}
                            selectionMode={selection.mode}
                            selected={selection.selectedIds.has(item.image.id)}
                            onToggleSelect={selection.onToggle}
                            onSetWallpaper={onSetWallpaper}
                            isAggregated={isAggregated}
                        />
                    </div>
                );
            })}
        </div>
    );
});

export const ImageGrid: React.FC<ImageGridProps> = ({
    allImages,
    columns,
    columnCount,
    sentinelRef,
    selection,
    status,
    onImageClick,
    onSetWallpaper,
    isAggregated,
}) => {
    const gridRef = useRef<HTMLDivElement>(null);
    const [parentOffsetTop, setParentOffsetTop] = useState(0);
    const { isLoading, isFetching, hasMore, page, error } = status;

    useEffect(() => {
        const updateOffset = () => {
            if (gridRef.current) {
                const rect = gridRef.current.getBoundingClientRect();
                setParentOffsetTop(rect.top + window.scrollY);
            }
        };
        updateOffset();
        window.addEventListener('resize', updateOffset);
        return () => window.removeEventListener('resize', updateOffset);
    }, [allImages.length, isLoading]);

    return (
        <Box ref={gridRef} style={{ position: 'relative', minHeight: '60vh' }}>
            {isLoading && page === 1 ? (
                <Center py={LOADING_CENTER_PY}><Loader size="xl" /></Center>
            ) : (
                <>
                    {error ? (
                        <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red">
                            Could not fetch images from the backend.
                        </Alert>
                    ) : (
                        <>
                            {allImages.length > 0 ? (
                                <SimpleGrid cols={columnCount} spacing="md" style={{ alignItems: 'flex-start' }}>
                                    {columns.map((col, colIdx) => (
                                        <VirtualColumn
                                            key={`col-${colIdx}`}
                                            items={col}
                                            parentOffsetTop={parentOffsetTop}
                                            selection={selection}
                                            onImageClick={onImageClick}
                                            onSetWallpaper={onSetWallpaper}
                                            isAggregated={isAggregated}
                                        />
                                    ))}
                                </SimpleGrid>
                            ) : (
                                !isFetching && (
                                    <Stack align="center" py={LOADING_CENTER_PY} gap="md">
                                        <Text size="xl" fw={500} c="dimmed">No images match your search</Text>
                                        <Text c="dimmed">Try different keywords or clear the search box.</Text>
                                    </Stack>
                                )
                            )}
                        </>
                    )}
                </>
            )}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} style={{ height: SENTINEL_HEIGHT_PX, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isFetching && hasMore && (
                    <Loader size="lg" variant="dots" color="blue" />
                )}
                {!hasMore && allImages.length > 0 && (
                    <Text c="dimmed" size="sm" mt="xl">You've reached the end of your collection</Text>
                )}
            </div>
        </Box>
    );
};
