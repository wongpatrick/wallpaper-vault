/**
 * @file
 * Module: Images Directory Page
 * Description: Provides an infinite-scrolling gallery of all individual wallpapers with search, filtering, and lightbox viewing capabilities.
 */
import { Title, Text, Container, Loader, Center, Alert, Stack, TextInput, Group, Box, SimpleGrid, SegmentedControl, Badge, ActionIcon, Tabs } from '@mantine/core';
import { IconAlertCircle, IconSearch, IconX, IconGridDots, IconPalette } from '@tabler/icons-react';
import { useReadImagesApiImagesGet } from '../../api/generated/images/images';
import { ImageGridItem } from '../../components/images/ImageGridItem';
import { ImageLightbox } from '../../components/images/ImageLightbox';
import { ImageEditModal } from '../../components/images/ImageEditModal';
import { SortControl } from '../../components/ui/SortControl';
import { CharacterAutocompleteInput } from '../../components/ui/CharacterAutocompleteInput';
import { FranchiseAutocompleteInput } from '../../components/ui/FranchiseAutocompleteInput';
import { ColorExplorer } from './ColorExplorer';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useIntersection, useViewportSize } from '@mantine/hooks';
import { useSearchParams } from 'react-router-dom';
import { useUrlSearch } from '../../hooks/useUrlSearch';
import { useUrlPagination } from '../../hooks/useUrlPagination';
import type { Image as ImageModel } from '../../api/model';

const PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 500;
const BREAKPOINT_SM = 600;
const BREAKPOINT_MD = 900;
const BREAKPOINT_LG = 1200;
const COLOR_DEBOUNCE_MS = 500;



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
        rating: ratingFilter === 'all' ? undefined : ratingFilter,
        tag: tagFilter,
        color: colorFilter,
        color_tolerance: colorTolerance,
        character: characterFilter ? [characterFilter] : undefined,
        franchise: franchiseFilter ? [franchiseFilter] : undefined,
        sort_by: sortBy,
        sort_dir: sortDir
    });

    // Updaters
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

    const handleColorChange = useCallback((hex: string) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('color', hex);
            next.delete('page');
            return next;
        }, { replace: true });
        setAllImages([]);
        setHasMore(true);
    }, [setSearchParams]);

    const handleClearColor = () => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete('color');
            next.delete('page');
            return next;
        }, { replace: true });
        setAllImages([]);
        setHasMore(true);
    };

    const handleToleranceChange = useCallback((value: number) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (value === 30) {
                next.delete('tolerance');
            } else {
                next.set('tolerance', value.toString());
            }
            next.delete('page');
            return next;
        }, { replace: true });
        setAllImages([]);
        setHasMore(true);
    }, [setSearchParams]);

    // Debounced color change for the wheel
    const colorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleColorPickerChange = useCallback((hex: string) => {
        if (colorDebounceRef.current) clearTimeout(colorDebounceRef.current);
        colorDebounceRef.current = setTimeout(() => {
            handleColorChange(hex);
        }, COLOR_DEBOUNCE_MS);
    }, [handleColorChange]);

    const handleClearTag = () => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete('tag');
            next.delete('page');
            return next;
        }, { replace: true });
        setAllImages([]);
        setHasMore(true);
    };

    const handleCharacterChange = (val: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (val) next.set('character', val);
            else next.delete('character');
            next.delete('page');
            return next;
        }, { replace: true });
        setAllImages([]);
        setHasMore(true);
    };

    const handleFranchiseChange = (val: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (val) next.set('franchise', val);
            else next.delete('franchise');
            next.delete('page');
            return next;
        }, { replace: true });
        setAllImages([]);
        setHasMore(true);
    };

    // Accumulate results and handle updates
    useEffect(() => {
        if (pageData?.items) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
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
        <Container fluid px="xl">
            <Stack gap="xs" mb="xl">
                <Title order={1} fw={800} style={{ letterSpacing: '-1px' }}>🖼️ Individual Wallpapers</Title>
                <Text c="dimmed" size="lg">Continuous stream of your entire library.</Text>
            </Stack>

            <Tabs value={activeTab} onChange={handleTabChange} mb="xl">
                <Tabs.List mb="md">
                    <Tabs.Tab value="gallery" leftSection={<IconGridDots size={16} />}>
                        Gallery Filters
                    </Tabs.Tab>
                    <Tabs.Tab value="explorer" leftSection={<IconPalette size={16} />}>
                        Color Explorer
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="gallery">
                    <Group align="flex-end" style={{ flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)' }}>
                <Stack gap={4} style={{ flex: 1, minWidth: 220, maxWidth: 400 }}>
                    <Text size="xs" fw={700} c="dimmed" ml={4}>Search</Text>
                    <TextInput
                        placeholder="Search by filename, set, tags, or artist..."
                        radius="md"
                        leftSection={<IconSearch size={16} />}
                        value={localSearch}
                        onChange={handleSearchChange}
                    />
                </Stack>
                {tagFilter && (
                    <Stack gap={4}>
                        <Text size="xs" fw={700} c="dimmed" ml={4}>Active Tag</Text>
                        <Badge
                            size="lg"
                            radius="md"
                            variant="light"
                            color="violet"
                            style={{ height: 36, textTransform: 'none', fontSize: 14 }}
                            rightSection={
                                <ActionIcon
                                    size="sm"
                                    color="violet"
                                    radius="md"
                                    variant="transparent"
                                    onClick={handleClearTag}
                                    aria-label="Clear tag filter"
                                >
                                    <IconX size={14} />
                                </ActionIcon>
                            }
                        >
                            #{tagFilter}
                        </Badge>
                    </Stack>
                )}
                <Stack gap={4} w={180}>
                    <Text size="xs" fw={700} c="dimmed" ml={4}>Filter by Character</Text>
                    <CharacterAutocompleteInput
                        placeholder="Character"
                        value={characterFilter || null}
                        onChange={handleCharacterChange}
                        radius="md"
                    />
                </Stack>
                <Stack gap={4} w={180}>
                    <Text size="xs" fw={700} c="dimmed" ml={4}>Filter by Franchise</Text>
                    <FranchiseAutocompleteInput
                        placeholder="Franchise"
                        value={franchiseFilter || null}
                        onChange={handleFranchiseChange}
                        radius="md"
                    />
                </Stack>

                <Stack gap={4}>
                    <Text size="xs" fw={700} c="dimmed" ml={4}>Filter by Rating</Text>
                    <SegmentedControl
                        value={ratingFilter}
                        onChange={handleRatingChange}
                        radius="md"
                        size="sm"
                        style={{ height: 36 }}
                        data={[
                            { label: 'All', value: 'all' },
                            { label: 'Safe', value: 'safe' },
                            { label: 'Questionable', value: 'questionable' },
                            { label: 'Explicit', value: 'explicit' },
                        ]}
                    />
                </Stack>
                <SortControl 
                    options={[
                        { label: 'Date Added', value: 'date_added' },
                        { label: 'File Size', value: 'file_size' },
                        { label: 'Resolution', value: 'resolution' },
                        { label: 'Rating', value: 'rating' },
                        { label: 'Aspect Ratio', value: 'aspect_ratio' },
                        { label: 'Random', value: 'random' },
                    ]} 
                    defaultSortBy="date_added" 
                />
                    </Group>
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
            <ImageLightbox
                images={allImages}
                selectedIndex={selectedImageIndex}
                onClose={() => setSelectedImageIndex(null)}
                onSelectIndex={setSelectedImageIndex}
                onEdit={(img) => setEditingImage(img)}
                totalCount={pageData?.total}
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
