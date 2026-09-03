/**
 * @file Masonry image grid gallery component for SetDetail page with virtualization.
 */
/* eslint-disable no-magic-numbers */
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Box, SimpleGrid } from '@mantine/core';
import { useViewportSize } from '@mantine/hooks';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { ImageGridItem } from '../../../components/images/ImageGridItem';
import { useVault } from '../../../hooks/useVault';
import type { Image as ImageModel } from '../../../api/model';

interface SetImageGalleryProps {
    images: ImageModel[] | undefined;
    selectionMode: boolean;
    selectedImageIds: Set<number>;
    toggleImageSelect: (id: number) => void;
    onImageClick: (index: number) => void;
    onSetWallpaper?: (image: ImageModel) => void;
}

interface VirtualColumnProps {
    items: { originalIdx: number; image: ImageModel }[];
    parentOffsetTop: number;
    onImageClick: (index: number) => void;
    selectionMode: boolean;
    selectedImageIds: Set<number>;
    toggleImageSelect: (id: number) => void;
    onSetWallpaper?: (image: ImageModel) => void;
    isAggregated?: boolean;
}

const ESTIMATED_ITEM_HEIGHT = 260;
const ITEM_PADDING_BOTTOM_PX = 16;
const BREAKPOINT_SM = 600;
const BREAKPOINT_MD = 900;
const BREAKPOINT_LG = 1200;

const VirtualColumn = React.memo(function VirtualColumn({
    items,
    parentOffsetTop,
    onImageClick,
    selectionMode,
    selectedImageIds,
    toggleImageSelect,
    onSetWallpaper,
    isAggregated,
}: VirtualColumnProps) {
    const virtualizer = useWindowVirtualizer({
        count: items.length,
        estimateSize: (index) => {
            const img = items[index]?.image;
            if (img?.width && img?.height) {
                return Math.round((img.height / img.width) * 300) + ITEM_PADDING_BOTTOM_PX;
            }
            return ESTIMATED_ITEM_HEIGHT;
        },
        overscan: 5,
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
                            selectionMode={selectionMode}
                            selected={selectedImageIds.has(item.image.id)}
                            onToggleSelect={toggleImageSelect}
                            onSetWallpaper={onSetWallpaper}
                            isAggregated={isAggregated}
                        />
                    </div>
                );
            })}
        </div>
    );
});

export function SetImageGallery({
    images,
    selectionMode,
    selectedImageIds,
    toggleImageSelect,
    onImageClick,
    onSetWallpaper,
}: SetImageGalleryProps) {
    const gridRef = useRef<HTMLDivElement>(null);
    const [parentOffsetTop, setParentOffsetTop] = useState(0);
    const { width } = useViewportSize();
    const { isAggregated } = useVault();

    const columnCount = useMemo(() => {
        if (width < BREAKPOINT_SM) return 1;
        if (width < BREAKPOINT_MD) return 2;
        if (width < BREAKPOINT_LG) return 3;
        return 4;
    }, [width]);

    const columns = useMemo(() => {
        if (!images) return [];
        const cols: { originalIdx: number; image: ImageModel }[][] = Array.from({ length: columnCount }, () => []);
        images.forEach((img, idx) => {
            cols[idx % columnCount].push({ originalIdx: idx, image: img });
        });
        return cols;
    }, [images, columnCount]);

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
    }, [images?.length]);

    if (!images || images.length === 0) {
        return null;
    }

    return (
        <Box ref={gridRef} style={{ position: 'relative', width: '100%' }}>
            <SimpleGrid cols={columnCount} spacing="md" style={{ alignItems: 'flex-start' }}>
                {columns.map((col, colIdx) => (
                    <VirtualColumn
                        key={`col-${colIdx}`}
                        items={col}
                        parentOffsetTop={parentOffsetTop}
                        onImageClick={onImageClick}
                        selectionMode={selectionMode}
                        selectedImageIds={selectedImageIds}
                        toggleImageSelect={toggleImageSelect}
                        onSetWallpaper={onSetWallpaper}
                        isAggregated={isAggregated}
                    />
                ))}
            </SimpleGrid>
        </Box>
    );
}
