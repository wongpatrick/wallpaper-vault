/**
 * @file
 * Module: Sets Directory Page
 * Description: Lists all wallpaper sets with search, filtering, pagination, and bulk management capabilities.
 */
import { useState, useCallback, useMemo } from 'react';
import { Title, Text, Container, Loader, Center, Alert, Stack, Group, Box, Overlay, Button } from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useMultiVaultSets } from '../../hooks/useMultiVaultQuery';
import { AggregatedVaultBanner } from '../../components/vault/AggregatedVaultBanner';
import { CreateSetModal } from '../../components/sets/CreateSetModal';
import { useLocation } from 'react-router-dom';
import { useUrlSearch } from '../../hooks/useUrlSearch';
import { useUrlPagination } from '../../hooks/useUrlPagination';
import { useSelection } from '../../hooks/useSelection';
import { SetBulkOperations } from '../../components/sets/SetBulkOperations';
import { PaginationWithSkip } from '../../components/ui/PaginationWithSkip';
import { useVault } from '../../hooks/useVault';
import { SetsFilterBar } from './components/SetsFilterBar';
import { SetsTableView } from './components/SetsTableView';
import { SetsGridView } from './components/SetsGridView';
import { useSetDeletion } from './hooks/useSetDeletion';
import { useSetFilters } from './hooks/useSetFilters';

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 500;
const PADDING_DEFAULT_PX = 40;
const PADDING_SELECTION_MODE_PX = 100;

export default function Sets() {
    const location = useLocation();
    const { search, localSearch, setLocalSearch } = useUrlSearch(SEARCH_DEBOUNCE_MS);
    const { page, setPage, totalPages: getTotalPages } = useUrlPagination(PAGE_SIZE);
    const [createModalOpened, setCreateModalOpened] = useState(false);
    const { switchVault } = useVault();

    // Selection State
    const { 
        selectionMode, 
        setSelectionMode, 
        selectedIds, 
        toggle: toggleSelect, 
        selectAll, 
        clear: clearSelection, 
        startSelectionWith 
    } = useSelection();

    // URL Filter State
    const {
        view,
        typeFilter,
        characterFilter,
        franchiseFilter,
        sortBy,
        sortDir,
        handleViewChange,
        handleTypeChange,
        handleCharacterChange,
        handleFranchiseChange
    } = useSetFilters(clearSelection);

    const { 
        data: pageData, 
        isLoading, 
        isFetching, 
        error, 
        refetch,
        isAggregated,
        onlineCount,
        totalVaultsCount,
        offlineVaults,
        partialErrors
    } = useMultiVaultSets({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        creator_type: typeFilter || undefined,
        character: characterFilter ? [characterFilter] : undefined,
        franchise: franchiseFilter ? [franchiseFilter] : undefined,
        sort_by: sortBy,
        sort_dir: sortDir
    });

    const sets = useMemo(() => pageData?.items || [], [pageData?.items]);
    const totalCount = pageData?.total || 0;
    const totalPages = getTotalPages(totalCount);

    const { handleDelete } = useSetDeletion(sets, isAggregated, refetch);

    const handleSearchChange = (val: string) => {
        setLocalSearch(val);
        clearSelection();
    };

    const handleLongPress = useCallback((id: number) => {
        if (!selectionMode) {
            startSelectionWith(id);
        }
    }, [selectionMode, startSelectionWith]);

    const selectedSets = sets.filter(s => selectedIds.has(s.id));

    return (
        <Container fluid px="xl" style={{ position: 'relative', paddingBottom: selectionMode ? PADDING_SELECTION_MODE_PX : PADDING_DEFAULT_PX }}>
            <AggregatedVaultBanner
                isAggregated={isAggregated}
                onlineCount={onlineCount}
                totalVaultsCount={totalVaultsCount}
                offlineVaults={offlineVaults}
                partialErrors={partialErrors}
            />

            <Group justify="space-between" align="flex-start" mb="xs">
                <Stack gap={0}>
                    <Title order={1}>📚 Wallpaper Sets</Title>
                    <Text c="dimmed">Browse and manage your curated wallpaper collections.</Text>
                </Stack>
                <Group gap="sm">
                    <Button
                        variant="filled"
                        color="blue"
                        onClick={() => setCreateModalOpened(true)}
                    >
                        Create Set
                    </Button>
                    <Button 
                        variant={selectionMode ? "filled" : "light"} 
                        color={selectionMode ? "blue" : "gray"}
                        leftSection={selectionMode ? <IconCheck size={16} /> : null}
                        onClick={() => selectionMode ? clearSelection() : setSelectionMode(true)}
                    >
                        {selectionMode ? "Finish Selecting" : "Select Items"}
                    </Button>
                </Group>
            </Group>

            <SetsFilterBar 
                localSearch={localSearch}
                onSearchChange={handleSearchChange}
                characterFilter={characterFilter}
                onCharacterChange={handleCharacterChange}
                franchiseFilter={franchiseFilter}
                onFranchiseChange={handleFranchiseChange}
                typeFilter={typeFilter}
                onTypeChange={handleTypeChange}
                view={view}
                onViewChange={handleViewChange}
            />
            
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
                                    <SetsTableView 
                                        sets={sets}
                                        isAggregated={isAggregated}
                                        selectedIds={selectedIds}
                                        selectionMode={selectionMode}
                                        toggleSelect={toggleSelect}
                                        startSelectionWith={startSelectionWith}
                                        switchVault={switchVault}
                                        locationPathname={location.pathname}
                                    />
                                ) : (
                                    <SetsGridView 
                                        sets={sets}
                                        handleDelete={handleDelete}
                                        selectionMode={selectionMode}
                                        selectedIds={selectedIds}
                                        toggleSelect={toggleSelect}
                                        handleLongPress={handleLongPress}
                                    />
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

            <CreateSetModal 
                opened={createModalOpened}
                onClose={() => setCreateModalOpened(false)}
                onSuccess={() => refetch()}
            />
        </Container>
    );
}
