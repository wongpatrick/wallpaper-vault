/**
 * @file
 * Module: Images Directory Page
 * Description: Provides an infinite-scrolling gallery of all individual wallpapers with search, filtering, and lightbox viewing capabilities.
 */
import { Title, Text, Container, Loader, Center, Alert, Stack, TextInput, Group, Box, SimpleGrid, SegmentedControl } from '@mantine/core';
import { IconAlertCircle, IconSearch } from '@tabler/icons-react';
import { useReadImagesApiImagesGet } from '../../api/generated/images/images';
import { ImageGridItem } from '../sets/components/ImageGridItem';
import { Lightbox } from '../sets/components/Lightbox';
import { ImageEditModal } from '../sets/components/ImageEditModal';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDebouncedValue, useIntersection, useViewportSize } from '@mantine/hooks';
import { useSearchParams } from 'react-router-dom';
import type { Image as ImageModel } from '../../api/model';

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 500;
const BREAKPOINT_SM = 600;
const BREAKPOINT_MD = 900;
const BREAKPOINT_LG = 1200;

export default function Images() {
    const [searchParams, setSearchParams] = useSearchParams();

    // URL State (Source of Truth for API)
    const search = searchParams.get('search') || '';
    const ratingFilter = searchParams.get('rating') || 'all';
    const page = parseInt(searchParams.get('page') || '1', 10);

    // Local Search State (Immediate UI feedback)
    const [localSearch, setLocalSearch] = useState(search);
    const [debouncedLocalSearch] = useDebouncedValue(localSearch, SEARCH_DEBOUNCE_MS);

    // Sync URL when local search is debounced
    useEffect(() => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            const currentUrlSearch = next.get('search') || '';
            
            if (debouncedLocalSearch !== currentUrlSearch) {
                if (!debouncedLocalSearch) next.delete('search');
                else next.set('search', debouncedLocalSearch);
                next.delete('page'); // Reset to page 1
            }
            return next;
        }, { replace: true });
    }, [debouncedLocalSearch, setSearchParams]);

    // Sync local search when URL changes (Back button)
    useEffect(() => {
        setLocalSearch(search);
    }, [search]);

    // Accumulate all images for infinite scroll
    const [allImages, setAllImages] = useState<ImageModel[]>([]);
    const [hasMore, setHasMore] = useState(true);

    const { width } = useViewportSize();

    // Responsive column count
    const columnCount = useMemo(() => {
        if (width < BREAKPOINT_SM) return 1;
        if (width < BREAKPOINT_MD) return 2;
        if (width < BREAKPOINT_LG) return 3;
        return 4;
    }, [width]);

    // Distribute images into columns to prevent re-flow issues with column-count
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
        rootMargin: '1200px', // Trigger loading 1200px before reaching the bottom
    });

    // Lightbox state
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

    // Edit Modal state
    const [editingImage, setEditingImage] = useState<ImageModel | null>(null);

    // Fetch data
    const { data: pageData, isLoading, isFetching, error, refetch } = useReadImagesApiImagesGet({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        rating: ratingFilter === 'all' ? undefined : ratingFilter
    });

    // Updaters
    const setPage = useCallback((newPageOrFn: number | ((prev: number) => number)) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            const currentPage = parseInt(next.get('page') || '1', 10);
            const newPage = typeof newPageOrFn === 'function' ? newPageOrFn(currentPage) : newPageOrFn;

            if (newPage <= 1) next.delete('page');
            else next.set('page', newPage.toString());
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalSearch(e.currentTarget.value);
    };

    const handleRatingChange = (val: string) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (val === 'all') next.delete('rating');
            else next.set('rating', val);
            next.delete('page');
            return next;
        }, { replace: true });
        setAllImages([]);
        setHasMore(true);
    };

    // Accumulate results and handle updates
    useEffect(() => {
        if (pageData?.items) {
            setAllImages(prev => {
                if (page === 1) {
                    return pageData.items!;
                }

                // Create a copy of previous images
                const next = [...prev];

                // Update existing or add new
                pageData.items!.forEach(newItem => {
                    const idx = next.findIndex(img => img.id === newItem.id);
                    if (idx !== -1) {
                        next[idx] = newItem;
                    } else {
                        next.push(newItem);
                    }
                });

                return next;
            });
            setHasMore(pageData.items.length === PAGE_SIZE);
        }
    }, [pageData, page]);

    // Load next page when sentinel is visible
    useEffect(() => {
        if (entry?.isIntersecting && hasMore && !isFetching && !isLoading && allImages.length > 0) {
            setPage(prev => prev + 1);
        }
    }, [entry?.isIntersecting, hasMore, isFetching, isLoading, allImages.length, setPage]);

    return (
        <Container size="xl" px="md">
            <Stack gap="xs" mb="xl">
                <Title order={1} fw={800} style={{ letterSpacing: '-1px' }}>🖼️ Individual Wallpapers</Title>
                <Text c="dimmed" size="lg">Continuous stream of your entire library.</Text>
            </Stack>

            <Group mb="xl" justify="space-between" align="flex-end">
                <TextInput
                    placeholder="Search by filename, set, tags, or artist..."
                    size="md"
                    radius="xl"
                    leftSection={<IconSearch size={18} />}
                    value={localSearch}
                    onChange={handleSearchChange}
                    style={{ flex: 1, maxWidth: 500 }}
                />
                <Stack gap={4}>
                    <Text size="xs" fw={700} c="dimmed" ml={4}>Filter by Rating</Text>
                    <SegmentedControl
                        value={ratingFilter}
                        onChange={handleRatingChange}
                        radius="xl"
                        size="sm"
                        data={[
                            { label: 'All', value: 'all' },
                            { label: 'Safe', value: 'safe' },
                            { label: 'Questionable', value: 'questionable' },
                            { label: 'Explicit', value: 'explicit' },
                        ]}
                    />
                </Stack>
            </Group>

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
                                                        onClick={() => setSelectedImageIndex(originalIdx)}
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

            {/* View Image */}
            <Lightbox
                images={allImages}
                selectedIndex={selectedImageIndex}
                onClose={() => setSelectedImageIndex(null)}
                onSelectIndex={setSelectedImageIndex}
                onEdit={(img) => setEditingImage(img)}
                onDelete={() => {
                    setAllImages([]);
                    setPage(1);
                    refetch();
                }}
            />

            {/* Edit Image */}
            <ImageEditModal
                image={editingImage}
                opened={editingImage !== null}
                onClose={() => setEditingImage(null)}
                onUpdated={() => {
                    setEditingImage(null);
                    refetch();
                }}
            />
        </Container>
    );
}
