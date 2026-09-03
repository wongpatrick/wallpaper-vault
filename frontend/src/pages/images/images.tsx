/**
 * @file
 * Module: Images Directory Page
 * Description: Provides an infinite-scrolling gallery of all individual wallpapers with search, filtering, and lightbox viewing capabilities.
 */
import { Title, Text, Container, Group, Tabs, Button, Stack } from '@mantine/core';
import { IconGridDots, IconPalette, IconCheck, IconPlaylist, IconEdit } from '@tabler/icons-react';
import { useBulkUpdateImagesApiImagesBulkUpdatePost } from '../../api/generated/images/images';
import { useMultiVaultImages } from '../../hooks/useMultiVaultQuery';
import { AggregatedVaultBanner } from '../../components/vault/AggregatedVaultBanner';

import { notifications } from '@mantine/notifications';
import { ImageLightbox } from '../../components/images/ImageLightbox';
import { ImageEditModal } from '../../components/images/ImageEditModal';
import { ImageBulkEditModal } from '../../components/images/ImageBulkEditModal';
import { ImageCropModal } from '../../components/images/ImageCropModal';
import { SetAsWallpaperModal } from '../../components/images/SetAsWallpaperModal';
import { GalleryFilterBar } from '../../components/images/GalleryFilterBar';
import { ImageGrid } from '../../components/images/ImageGrid';
import { ColorExplorer } from './ColorExplorer';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useIntersection, useViewportSize } from '@mantine/hooks';

import { useSearchParams } from 'react-router-dom';
import { useUrlSearch } from '../../hooks/useUrlSearch';
import { useUrlPagination } from '../../hooks/useUrlPagination';
import { useSelection } from '../../hooks/useSelection';
import { FloatingSelectionBar } from '../../components/ui/FloatingSelectionBar';
import { AddToPlaylistModal } from '../../components/playlists/AddToPlaylistModal';
import type { Image as ImageModel, BulkOperationMode, ImageUpdate } from '../../api/model';
import type { WithMultiVault } from '../../types/vault';


const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 500;
const BREAKPOINT_SM = 600;
const BREAKPOINT_MD = 900;
const BREAKPOINT_LG = 1200;
const COLOR_DEBOUNCE_MS = 500;
const DEFAULT_TOLERANCE = 30;

export default function Images() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { search, localSearch, setLocalSearch } = useUrlSearch(SEARCH_DEBOUNCE_MS);

    // URL State (Source of Truth for API)
    const ratingFilter = searchParams.get('rating') || 'all';
    const tagFilter = searchParams.get('tag') || undefined;
    const colorFilter = searchParams.get('color') || undefined;
    const colorTolerance = parseInt(searchParams.get('tolerance') || '30', 10);
    const characterFilter = searchParams.get('character') || undefined;
    const franchiseFilter = searchParams.get('franchise') || undefined;
    const { page, setPage } = useUrlPagination(PAGE_SIZE);
    const sortBy = searchParams.get('sort_by') || 'date_added';
    const sortDir = (searchParams.get('sort_dir') as 'asc' | 'desc') || 'desc';
    const activeTab = searchParams.get('tab') || 'gallery';

    const handleTabChange = (value: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (value === 'gallery') next.delete('tab');
            else if (value) next.set('tab', value);
            return next;
        }, { replace: true });
    };

    // Accumulate all images for infinite scroll
    const [allImages, setAllImages] = useState<ImageModel[]>([]);
    const [hasMore, setHasMore] = useState(true);

    const { width } = useViewportSize();

    // Responsive column count & image distribution
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

    // Sentinel for infinite scroll
    const { ref: sentinelRef, entry } = useIntersection({
        threshold: 0,
        rootMargin: '1200px',
    });

    // Lightbox & Modal states
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [editingImage, setEditingImage] = useState<ImageModel | null>(null);
    const [croppingImage, setCroppingImage] = useState<ImageModel | null>(null);

    // Selection state
    const { selectionMode, setSelectionMode, selectedIds: selectedImageIds, toggle: toggleImageSelect, clear: clearSelection } = useSelection();
    const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    const [wallpaperImage, setWallpaperImage] = useState<ImageModel | null>(null);

    const bulkUpdateMutation = useBulkUpdateImagesApiImagesBulkUpdatePost();

    // Fetch data
    const { 
        data: pageData, 
        isLoading, 
        isFetching, 
        error, 
        refetch,
        isAggregated,
        onlineCount,
        totalVaultsCount,
        offlineVaults
    } = useMultiVaultImages({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        rating: ratingFilter === 'all' ? undefined : ratingFilter,
        tag: tagFilter,
        color: colorFilter,
        color_tolerance: colorTolerance,
        character: characterFilter ? [characterFilter] : undefined,
        franchise: franchiseFilter ? [franchiseFilter] : undefined,
        sort_by: sortBy,
        sort_dir: sortDir
    });


    // Unified helper to update search params and reset collection pagination
    const updateFilterParam = useCallback((key: string, value: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (value) next.set(key, value);
            else next.delete(key);
            next.delete('page');
            return next;
        }, { replace: true });
        setAllImages([]);
        setHasMore(true);
    }, [setSearchParams]);

    // Filter Handlers
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => setLocalSearch(e.currentTarget.value);
    const handleRatingChange = (val: string) => updateFilterParam('rating', val === 'all' ? null : val);
    const handleColorChange = useCallback((hex: string) => updateFilterParam('color', hex), [updateFilterParam]);
    const handleClearColor = () => updateFilterParam('color', null);
    const handleClearTag = () => updateFilterParam('tag', null);
    const handleCharacterChange = (val: string | null) => updateFilterParam('character', val);
    const handleFranchiseChange = (val: string | null) => updateFilterParam('franchise', val);
    const handleToleranceChange = useCallback((val: number) => {
        updateFilterParam('tolerance', val === DEFAULT_TOLERANCE ? null : val.toString());
    }, [updateFilterParam]);

    // Debounced color picker handler
    const colorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleColorPickerChange = useCallback((hex: string) => {
        if (colorDebounceRef.current) clearTimeout(colorDebounceRef.current);
        colorDebounceRef.current = setTimeout(() => handleColorChange(hex), COLOR_DEBOUNCE_MS);
    }, [handleColorChange]);

    const handleImageClick = useCallback((originalIdx: number) => setSelectedImageIndex(originalIdx), []);
    const handleToggleSelect = useCallback((id: number) => toggleImageSelect(id), [toggleImageSelect]);
    const handleSetWallpaper = useCallback((img: ImageModel) => setWallpaperImage(img), []);

    // Reset/Refetch helper for image modifications
    const handleCollectionReset = () => {
        setAllImages([]);
        setPage(1);
        refetch();
    };

    const handleBulkEditConfirm = async (data: Partial<ImageUpdate>, mode: BulkOperationMode) => {
        if (isAggregated) {
            notifications.show({
                title: 'Operation Not Supported',
                message: 'Bulk editing across multiple vaults is not supported. Please switch to a specific vault first.',
                color: 'yellow'
            });
            return;
        }

        try {
            await bulkUpdateMutation.mutateAsync({
                data: {
                    image_ids: Array.from(selectedImageIds),
                    update_data: data,
                    operation_mode: mode,
                },
            });
            notifications.show({
                title: 'Success',
                message: `Successfully updated ${selectedImageIds.size} images.`,
                color: 'green',
            });
            setIsBulkEditOpen(false);
            clearSelection();
            handleCollectionReset();
        } catch (err) {
            console.error('Bulk update failed:', err);
            notifications.show({
                title: 'Error',
                message: 'Failed to update images in bulk.',
                color: 'red',
            });
        }
    };

    // Accumulate results & page updates
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


    // Trigger next page when sentinel is visible
    useEffect(() => {
        if (entry?.isIntersecting && hasMore && !isFetching && !isLoading && allImages.length > 0) {
            setPage(prev => prev + 1);
        }
    }, [entry?.isIntersecting, hasMore, isFetching, isLoading, allImages.length, setPage]);

    return (
        <Container fluid px="xl">
            <AggregatedVaultBanner
                isAggregated={isAggregated}
                onlineCount={onlineCount}
                totalVaultsCount={totalVaultsCount}
                offlineVaults={offlineVaults}
            />

            <Group justify="space-between" align="flex-start" mb="xl">
                <Stack gap={0}>
                    <Title order={1} fw={800} style={{ letterSpacing: '-1px' }}>🖼️ Individual Wallpapers</Title>

                    <Text c="dimmed" size="lg">Continuous stream of your entire library.</Text>
                </Stack>
                <Button 
                    variant={selectionMode ? "filled" : "light"} 
                    color={selectionMode ? "blue" : "gray"}
                    leftSection={selectionMode ? <IconCheck size={16} /> : null}
                    onClick={() => selectionMode ? clearSelection() : setSelectionMode(true)}
                >
                    {selectionMode ? "Finish Selecting" : "Select Items"}
                </Button>
            </Group>

            <Tabs value={activeTab} onChange={handleTabChange} mb="xl">
                <Tabs.List mb="md">
                    <Tabs.Tab value="gallery" leftSection={<IconGridDots size={16} />}>Gallery Filters</Tabs.Tab>
                    <Tabs.Tab value="explorer" leftSection={<IconPalette size={16} />}>Color Explorer</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="gallery">
                    <GalleryFilterBar
                        localSearch={localSearch}
                        onSearchChange={handleSearchChange}
                        tagFilter={tagFilter}
                        onClearTag={handleClearTag}
                        characterFilter={characterFilter || null}
                        onCharacterChange={handleCharacterChange}
                        franchiseFilter={franchiseFilter || null}
                        onFranchiseChange={handleFranchiseChange}
                        ratingFilter={ratingFilter}
                        onRatingChange={handleRatingChange}
                    />
                </Tabs.Panel>
                
                <Tabs.Panel value="explorer">
                    <ColorExplorer 
                        activeColor={colorFilter || undefined} 
                        onColorSelect={handleColorChange}
                        onColorPickerChange={handleColorPickerChange}
                        onClearColor={handleClearColor}
                        tolerance={colorTolerance}
                        onToleranceChange={handleToleranceChange}
                    />
                </Tabs.Panel>
            </Tabs>

            <ImageGrid
                allImages={allImages}
                columns={columns}
                columnCount={columnCount}
                isLoading={isLoading}
                isFetching={isFetching}
                hasMore={hasMore}
                page={page}
                error={error}
                sentinelRef={sentinelRef}
                selectionMode={selectionMode}
                selectedImageIds={selectedImageIds}
                onToggleSelect={handleToggleSelect}
                onImageClick={handleImageClick}
                onSetWallpaper={handleSetWallpaper}
                isAggregated={isAggregated}
            />

            <ImageLightbox
                images={allImages}
                selectedIndex={selectedImageIndex}
                onClose={() => setSelectedImageIndex(null)}
                onSelectIndex={setSelectedImageIndex}
                onEdit={(img) => setEditingImage(img)}
                totalCount={pageData?.total}
                onDelete={handleCollectionReset}
                onUpdated={handleCollectionReset}
                onCrop={(img) => setCroppingImage(img)}
            />

            <SetAsWallpaperModal
                opened={wallpaperImage !== null}
                onClose={() => setWallpaperImage(null)}
                image={wallpaperImage}
            />

            <ImageEditModal
                image={editingImage}
                opened={editingImage !== null}
                onClose={() => setEditingImage(null)}
                onUpdated={() => {
                    setEditingImage(null);
                    refetch();
                }}
            />

            {croppingImage && (
                <ImageCropModal 
                    key={croppingImage.id}
                    image={croppingImage}
                    opened={!!croppingImage}
                    onClose={() => setCroppingImage(null)}
                    onCropSuccess={handleCollectionReset}
                />
            )}

            <FloatingSelectionBar
                mounted={selectionMode && selectedImageIds.size > 0}
                selectedCount={selectedImageIds.size}
                onClear={clearSelection}
                itemLabel="images"
                minWidth={300}
            >
                <Button
                    size="xs"
                    variant="light"
                    color="blue"
                    leftSection={<IconEdit size={14} />}
                    radius="xl"
                    onClick={() => setIsBulkEditOpen(true)}
                >
                    Bulk Edit
                </Button>
                <Button
                    size="xs"
                    variant="light"
                    color="violet"
                    leftSection={<IconPlaylist size={14} />}
                    radius="xl"
                    onClick={() => setIsAddToPlaylistOpen(true)}
                >
                    Add to Playlist
                </Button>
            </FloatingSelectionBar>

            <ImageBulkEditModal
                opened={isBulkEditOpen}
                onClose={() => setIsBulkEditOpen(false)}
                onConfirm={handleBulkEditConfirm}
                loading={bulkUpdateMutation.isPending}
                selectedCount={selectedImageIds.size}
            />

            <AddToPlaylistModal
                opened={isAddToPlaylistOpen}
                onClose={() => setIsAddToPlaylistOpen(false)}
                imageIds={Array.from(selectedImageIds)}
                onSuccess={() => {
                    clearSelection();
                    refetch();
                }}
            />
        </Container>
    );
}
