import { Title, Text, Container, Loader, Center, Alert, Stack, TextInput, Group, Box, SimpleGrid, SegmentedControl } from '@mantine/core';
import { IconAlertCircle, IconSearch } from '@tabler/icons-react';
import { useReadImagesApiImagesGet } from '../../api/generated/images/images';
import { ImageGridItem } from '../sets/components/ImageGridItem';
import { Lightbox } from '../sets/components/Lightbox';
import { ImageEditModal } from '../sets/components/ImageEditModal';
import { useState, useEffect, useMemo } from 'react';
import { useDebouncedValue, useIntersection, useViewportSize } from '@mantine/hooks';
import type { Image as ImageModel } from '../../api/model';

const PAGE_SIZE = 100;

export default function Images() {
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [ratingFilter, setRatingFilter] = useState<string>('all');
    const [page, setPage] = useState(1);

    // Accumulate all images for infinite scroll
    const [allImages, setAllImages] = useState<ImageModel[]>([]);
    const [hasMore, setHasMore] = useState(true);

    const { width } = useViewportSize();

    // Responsive column count
    const columnCount = useMemo(() => {
        if (width < 600) return 1;
        if (width < 900) return 2;
        if (width < 1200) return 3;
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
        search: debouncedSearch || undefined,
        rating: ratingFilter === 'all' ? undefined : ratingFilter
    });

    // Reset when search or rating changes (via debounce/handler)
    useEffect(() => {
        setAllImages([]);
        setPage(1);
        setHasMore(true);
    }, [debouncedSearch]);

    const handleRatingChange = (val: string) => {
        setRatingFilter(val);
        setAllImages([]);
        setPage(1);
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
    }, [entry?.isIntersecting, hasMore, isFetching, isLoading, allImages.length]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.currentTarget.value);
    };

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
                    value={search}
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
