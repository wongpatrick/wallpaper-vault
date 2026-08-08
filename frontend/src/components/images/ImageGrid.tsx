/**
 * @file
 * Module: Image Grid Component
 * Description: Displays a responsive grid of wallpapers with selection support and infinite scroll sentinel.
 */
import React from 'react';
import { Box, Center, Loader, Alert, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { ImageGridItem } from './ImageGridItem';
import type { Image as ImageModel } from '../../api/model';

export interface ImageGridProps {
    allImages: ImageModel[];
    columns: { originalIdx: number; image: ImageModel }[][];
    columnCount: number;
    isLoading: boolean;
    isFetching: boolean;
    hasMore: boolean;
    page: number;
    error: unknown;
    sentinelRef: (element: HTMLElement | null) => void;
    selectionMode: boolean;
    selectedImageIds: Set<number>;
    onToggleSelect: (id: number) => void;
    onImageClick: (originalIdx: number) => void;
    onSetWallpaper?: (image: ImageModel) => void;
}

export const ImageGrid: React.FC<ImageGridProps> = ({
    allImages,
    columns,
    columnCount,
    isLoading,
    isFetching,
    hasMore,
    page,
    error,
    sentinelRef,
    selectionMode,
    selectedImageIds,
    onToggleSelect,
    onImageClick,
    onSetWallpaper,
}) => {
    return (
        <Box style={{ position: 'relative', minHeight: '60vh' }}>
            {isLoading && page === 1 ? (
                <Center py={100}><Loader size="xl" /></Center>
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
                                        <Stack key={`col-${colIdx}`} gap="md">
                                            {col.map(({ originalIdx, image }) => (
                                                <ImageGridItem
                                                    key={`${image.id}-${originalIdx}`}
                                                    image={image}
                                                    onClick={() => onImageClick(originalIdx)}
                                                    selectionMode={selectionMode}
                                                    selected={selectedImageIds.has(image.id)}
                                                    onToggleSelect={() => onToggleSelect(image.id)}
                                                    onSetWallpaper={onSetWallpaper}
                                                />
                                            ))}
                                        </Stack>
                                    ))}
                                </SimpleGrid>
                            ) : (
                                !isFetching && (
                                    <Stack align="center" py={100} gap="md">
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
            <div ref={sentinelRef} style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
