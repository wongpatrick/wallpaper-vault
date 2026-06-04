/**
 * @file
 * Module: Sets Directory Page
 * Description: Lists all wallpaper sets with search, filtering, pagination, and bulk management capabilities.
 */
import { Title, Text, Container, SimpleGrid, Loader, Center, Alert, Stack, TextInput, Group, Select, Box, Overlay, Button } from '@mantine/core';
import { IconAlertCircle, IconSearch, IconFilter, IconCheck } from '@tabler/icons-react';
import { useReadSetsApiSetsGet, useDeleteSetApiSetsSetIdDelete } from '../../api/generated/sets/sets';
import { notifications } from '@mantine/notifications';
import { SetCard } from '../../components/sets/SetCard';
import { CREATOR_TYPES } from '../../types/enums';
import { useSearchParams } from 'react-router-dom';
import { useUrlSearch } from '../../hooks/useUrlSearch';
import { useUrlPagination } from '../../hooks/useUrlPagination';
import { useSelection } from '../../hooks/useSelection';
import { SetBulkOperations } from '../../components/sets/SetBulkOperations';
import { PaginationWithSkip } from '../../components/ui/PaginationWithSkip';

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 500;
const PADDING_DEFAULT_PX = 40;
const PADDING_SELECTION_MODE_PX = 100;

export default function Sets() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { search, localSearch, setLocalSearch } = useUrlSearch(SEARCH_DEBOUNCE_MS);
    const { page, setPage, totalPages: getTotalPages } = useUrlPagination(PAGE_SIZE);

    // URL State (Source of Truth for API)
    const typeFilter = searchParams.get('type') || null;
    
    // Selection State
    const { selectionMode, setSelectionMode, selectedIds, toggle: toggleSelect, selectAll, clear: clearSelection, startSelectionWith } = useSelection();

    const { data: pageData, isLoading, isFetching, error, refetch } = useReadSetsApiSetsGet({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        creator_type: typeFilter || undefined
    });

    const sets = pageData?.items || [];
    const totalCount = pageData?.total || 0;
    const totalPages = getTotalPages(totalCount);

    const deleteMutation = useDeleteSetApiSetsSetIdDelete();

    // Handlers
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
        <Container size="xl" style={{ position: 'relative', paddingBottom: selectionMode ? PADDING_SELECTION_MODE_PX : PADDING_DEFAULT_PX }}>
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

            <Group mb="xl" grow align="flex-end">
                <TextInput
                    placeholder="Search titles or artists..."
                    label="Search entire library"
                    leftSection={<IconSearch size={16} />}
                    value={localSearch}
                    onChange={(e) => handleSearchChange(e.currentTarget.value)}
                />
                <Select
                    label="Artist type"
                    placeholder="All types"
                    leftSection={<IconFilter size={16} />}
                    data={CREATOR_TYPES as unknown as string[]}
                    clearable
                    value={typeFilter}
                    onChange={handleTypeChange}
                />
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

                                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
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
                                </SimpleGrid>
                                
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
