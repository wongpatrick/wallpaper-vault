/**
 * @file
 * Module: Sets Directory Page
 * Description: Lists all wallpaper sets with search, filtering, pagination, and bulk management capabilities.
 */
import { Title, Text, Container, Loader, Center, Alert, Stack, TextInput, Group, Select, Box, Overlay, Button, SegmentedControl, Table, Image, Checkbox } from '@mantine/core';
import { IconAlertCircle, IconSearch, IconFilter, IconCheck, IconList, IconLayoutGrid } from '@tabler/icons-react';
import { useReadSetsApiSetsGet, useDeleteSetApiSetsSetIdDelete } from '../../api/generated/sets/sets';
import { notifications } from '@mantine/notifications';
import { SetCard } from '../../components/sets/SetCard';
import { CREATOR_TYPES } from '../../types/enums';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getThumbnailUrl, FALLBACK_IMAGE } from '../../utils/fileUtils';
import { useUrlSearch } from '../../hooks/useUrlSearch';
import { useUrlPagination } from '../../hooks/useUrlPagination';
import { useSelection } from '../../hooks/useSelection';
import { SetBulkOperations } from '../../components/sets/SetBulkOperations';
import { PaginationWithSkip } from '../../components/ui/PaginationWithSkip';
import { SortControl } from '../../components/ui/SortControl';
import { CharacterAutocompleteInput } from '../../components/ui/CharacterAutocompleteInput';
import { FranchiseAutocompleteInput } from '../../components/ui/FranchiseAutocompleteInput';

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 500;
const PADDING_DEFAULT_PX = 40;
const PADDING_SELECTION_MODE_PX = 100;

export default function Sets() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { search, localSearch, setLocalSearch } = useUrlSearch(SEARCH_DEBOUNCE_MS);
    const { page, setPage, totalPages: getTotalPages } = useUrlPagination(PAGE_SIZE);

    // View state
    const view = searchParams.get('view') || 'card';

    // URL State (Source of Truth for API)
    const typeFilter = searchParams.get('type') || null;
    const characterFilter = searchParams.get('character') || undefined;
    const franchiseFilter = searchParams.get('franchise') || undefined;
    const sortBy = searchParams.get('sort_by') || 'date_added';
    const sortDir = (searchParams.get('sort_dir') as 'asc' | 'desc') || 'desc';
    
    // Selection State
    const { selectionMode, setSelectionMode, selectedIds, toggle: toggleSelect, selectAll, clear: clearSelection, startSelectionWith } = useSelection();

    const { data: pageData, isLoading, isFetching, error, refetch } = useReadSetsApiSetsGet({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        creator_type: typeFilter || undefined,
        character: characterFilter ? [characterFilter] : undefined,
        franchise: franchiseFilter ? [franchiseFilter] : undefined,
        sort_by: sortBy,
        sort_dir: sortDir
    });

    const sets = pageData?.items || [];
    const totalCount = pageData?.total || 0;
    const totalPages = getTotalPages(totalCount);

    const deleteMutation = useDeleteSetApiSetsSetIdDelete();

    // Handlers
    const handleViewChange = (val: string) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (val === 'card') next.delete('view'); // default
            else next.set('view', val);
            return next;
        }, { replace: true });
    };

    const handleSearchChange = (val: string) => {
        setLocalSearch(val);
        clearSelection();
    };

    const handleTypeChange = (val: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (!val) next.delete('type');
            else next.set('type', val);
            next.delete('page');
            return next;
        }, { replace: true });
        clearSelection();
    };

    const handleCharacterChange = (val: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (val) next.set('character', val);
            else next.delete('character');
            next.delete('page');
            return next;
        }, { replace: true });
        clearSelection();
    };

    const handleFranchiseChange = (val: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (val) next.set('franchise', val);
            else next.delete('franchise');
            next.delete('page');
            return next;
        }, { replace: true });
        clearSelection();
    };

    const handleDelete = async (setId: number) => {
        try {
            await deleteMutation.mutateAsync({ setId });
            notifications.show({
                title: 'Set deleted',
                message: 'The set has been removed from your library.',
                color: 'blue',
            });
            refetch();
        } catch {
            notifications.show({
                title: 'Error',
                message: 'Could not delete the set.',
                color: 'red',
            });
        }
    };





    const selectedSets = sets.filter(s => selectedIds.has(s.id));

    return (
        <Container fluid px="xl" style={{ position: 'relative', paddingBottom: selectionMode ? PADDING_SELECTION_MODE_PX : PADDING_DEFAULT_PX }}>
            <Group justify="space-between" align="flex-start" mb="xs">
                <Stack gap={0}>
                    <Title order={1}>📚 Wallpaper Sets</Title>
                    <Text c="dimmed">Browse and manage your curated wallpaper collections.</Text>
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

            <Group mb="xl" align="flex-end" style={{ flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)' }}>
                <Stack gap={4} style={{ flex: 1, minWidth: 220, maxWidth: 400 }}>
                    <Text size="xs" fw={700} c="dimmed" ml={4}>Search</Text>
                    <TextInput
                        placeholder="Search titles, tags, or artists..."
                        leftSection={<IconSearch size={16} />}
                        value={localSearch}
                        onChange={(e) => handleSearchChange(e.currentTarget.value)}
                    />
                </Stack>
                <Stack gap={4} w={180}>
                    <Text size="xs" fw={700} c="dimmed" ml={4}>Filter by Character</Text>
                    <CharacterAutocompleteInput
                        placeholder="Character"
                        value={characterFilter || null}
                        onChange={handleCharacterChange}
                    />
                </Stack>
                <Stack gap={4} w={180}>
                    <Text size="xs" fw={700} c="dimmed" ml={4}>Filter by Franchise</Text>
                    <FranchiseAutocompleteInput
                        placeholder="Franchise"
                        value={franchiseFilter || null}
                        onChange={handleFranchiseChange}
                    />
                </Stack>
                <Stack gap={4} w={160}>
                    <Text size="xs" fw={700} c="dimmed" ml={4}>Artist type</Text>
                    <Select
                        placeholder="All types"
                        leftSection={<IconFilter size={16} />}
                        data={CREATOR_TYPES as unknown as string[]}
                        clearable
                        value={typeFilter}
                        onChange={handleTypeChange}
                    />
                </Stack>
                <Group gap="xs">
                    <SortControl 
                        options={[
                            { label: 'Date Added', value: 'date_added' },
                            { label: 'Title (A-Z)', value: 'title' },
                            { label: 'Image Count', value: 'image_count' }
                        ]}
                        defaultSortBy="date_added"
                    />
                    <SegmentedControl
                        value={view}
                        onChange={handleViewChange}
                        data={[
                            { label: <Center><IconList size={16} /></Center>, value: 'list' },
                            { label: <Center><IconLayoutGrid size={16} /></Center>, value: 'card' },
                        ]}
                    />
                </Group>
            </Group>
            
            <Box style={{ position: 'relative', minHeight: 400 }}>
                 {/* Initial Loading */}
                 {isLoading && !sets.length ? (
                    <Center py={100}><Loader size="xl" /></Center>
                 ) : (
                    <>
                        {/* Re-fetching Overlay (Search/Pagination) */}
                        {isFetching && (
                            <Overlay color="#fff" backgroundOpacity={0.5} blur={1} zIndex={10}>
                                <Center style={{ height: '100%' }}>
                                    <Loader size="lg" />
                                </Center>
                            </Overlay>
                        )}

                        {error ? (
                            <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red">
                                Could not fetch sets from the backend.
                            </Alert>
                        ) : (
                            <>
                                <Group mb="md" justify="space-between" visibleFrom="sm">
                                    {selectionMode && (
                                        <Button variant="subtle" size="xs" onClick={() => selectAll(sets.map(s => s.id))}>
                                            Select all on this page
                                        </Button>
                                    )}
                                </Group>

                                {view === 'list' ? (
                                    <Table.ScrollContainer minWidth={800} mb="xl">
                                        <Table verticalSpacing="sm" highlightOnHover>
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th w={40}></Table.Th>
                                                    <Table.Th w={100}>Preview</Table.Th>
                                                    <Table.Th>Title</Table.Th>
                                                    <Table.Th>Creator(s)</Table.Th>
                                                    <Table.Th>Images</Table.Th>
                                                    <Table.Th>Date Added</Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {sets.map(set => {
                                                    const currentImage = set.images && set.images.length > 0 ? set.images[0] : null;
                                                    const coverUrl = currentImage ? getThumbnailUrl(currentImage.id, 'sm') : FALLBACK_IMAGE;
                                                    const creatorNames = set.creators?.map(c => c.canonical_name).join(', ') || '-';
                                                    const dateAdded = new Date(set.date_added).toLocaleDateString();

                                                    return (
                                                        <Table.Tr 
                                                            key={set.id}
                                                            onClick={() => navigate(`/sets/${set.id}`)}
                                                            style={{ cursor: 'pointer', backgroundColor: selectedIds.has(set.id) ? 'var(--mantine-color-blue-light)' : undefined }}
                                                        >
                                                            <Table.Td onClick={(e) => e.stopPropagation()}>
                                                                <Checkbox 
                                                                    checked={selectedIds.has(set.id)}
                                                                    onChange={() => {
                                                                        if (!selectionMode) startSelectionWith(set.id);
                                                                        else toggleSelect(set.id);
                                                                    }}
                                                                />
                                                            </Table.Td>
                                                            <Table.Td>
                                                                <Image src={coverUrl} w={80} h={60} radius="sm" fit="cover" />
                                                            </Table.Td>
                                                            <Table.Td fw={500}>{set.title || 'Untitled Set'}</Table.Td>
                                                            <Table.Td>{creatorNames}</Table.Td>
                                                            <Table.Td>{set.images?.length || 0}</Table.Td>
                                                            <Table.Td c="dimmed">{dateAdded}</Table.Td>
                                                        </Table.Tr>
                                                    );
                                                })}
                                            </Table.Tbody>
                                        </Table>
                                    </Table.ScrollContainer>
                                ) : (
                                    <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--mantine-spacing-lg)' }}>
                                        {sets.map((set) => (
                                            <SetCard 
                                                key={set.id} 
                                                set={set} 
                                                onDelete={handleDelete}
                                                selectionMode={selectionMode}
                                                selected={selectedIds.has(set.id)}
                                                onToggleSelect={() => toggleSelect(set.id)}
                                                onLongPress={() => {
                                                    if (!selectionMode) {
                                                        startSelectionWith(set.id);
                                                    }
                                                }}
                                            />
                                        ))}
                                    </Box>
                                )}
                                
                                {sets.length === 0 && !isFetching && (
                                    <Stack align="center" py={100} gap="md">
                                        <Text size="xl" fw={500} c="dimmed">No sets match your filters</Text>
                                        <Text c="dimmed">Try adjusting your search terms or clearing the type filter.</Text>
                                    </Stack>
                                )}
                            </>
                        )}
                    </>
                )}
            </Box>

            {totalPages > 1 && (
                <Center mt="xl" pb="xl">
                    <PaginationWithSkip total={totalPages} value={page} onChange={setPage} withEdges />
                </Center>
            )}

            <SetBulkOperations 
                selectedIds={selectedIds}
                clearSelection={clearSelection}
                selectionMode={selectionMode}
                refetch={refetch}
                selectedSets={selectedSets}
            />
        </Container>
    );
}
