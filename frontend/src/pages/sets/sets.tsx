/**
 * @file
 * Module: Sets Directory Page
 * Description: Lists all wallpaper sets with search, filtering, pagination, and bulk management capabilities.
 */
import { Title, Text, Container, SimpleGrid, Loader, Center, Alert, Stack, TextInput, Group, Select, Pagination, Box, Overlay, Button, Paper, Transition, ActionIcon } from '@mantine/core';
import { IconAlertCircle, IconSearch, IconFilter, IconCheck, IconX, IconTrash, IconTag, IconUserEdit, IconGitMerge } from '@tabler/icons-react';
import { useReadSetsApiSetsGet, useDeleteSetApiSetsSetIdDelete, useBulkUpdateSetsApiSetsBulkUpdatePost, useBulkDeleteSetsApiSetsBulkDeletePost, useMergeSetsApiSetsMergePost } from '../../api/generated/sets/sets';
import { notifications } from '@mantine/notifications';
import { SetCard } from '../../components/sets/SetCard';
import { SetBulkEditModal } from '../../components/sets/SetBulkEditModal';
import { CREATOR_TYPES } from '../../types/enums';
import { MergeSetsModal } from '../../components/sets/MergeSetsModal';
import { useState, useEffect } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { useSearchParams } from 'react-router-dom';
import type { SetUpdate, BulkOperationMode } from '../../api/model';

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 500;
const PADDING_DEFAULT_PX = 40;
const PADDING_SELECTION_MODE_PX = 100;

export default function Sets() {
    const [searchParams, setSearchParams] = useSearchParams();

    // URL State (Source of Truth for API)
    const page = parseInt(searchParams.get('page') || '1', 10);
    const search = searchParams.get('search') || '';
    const typeFilter = searchParams.get('type') || null;
    
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

    // Selection State
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [modalType, setModalType] = useState<'artist' | 'tags' | 'delete' | null>(null);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

    const { data: pageData, isLoading, isFetching, error, refetch } = useReadSetsApiSetsGet({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        creator_type: typeFilter || undefined
    });

    const sets = pageData?.items || [];
    const totalCount = pageData?.total || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const deleteMutation = useDeleteSetApiSetsSetIdDelete();
    const bulkUpdateMutation = useBulkUpdateSetsApiSetsBulkUpdatePost();
    const bulkDeleteMutation = useBulkDeleteSetsApiSetsBulkDeletePost();
    const mergeMutation = useMergeSetsApiSetsMergePost();

    // Updaters
    const setPage = (newPage: number) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (newPage <= 1) next.delete('page');
            else next.set('page', newPage.toString());
            return next;
        }, { replace: true });
    };

    // Handlers
    const handleSearchChange = (val: string) => {
        setLocalSearch(val);
        setSelectedIds(new Set());
        setSelectionMode(false);
    };

    const handleTypeChange = (val: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (!val) next.delete('type');
            else next.set('type', val);
            next.delete('page');
            return next;
        }, { replace: true });
        setSelectedIds(new Set());
        setSelectionMode(false);
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

    const toggleSelect = (id: number) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
        if (next.size > 0) setSelectionMode(true);
    };

    const selectAllVisible = () => {
        const next = new Set(selectedIds);
        sets.forEach(s => next.add(s.id));
        setSelectedIds(next);
        setSelectionMode(true);
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
        setSelectionMode(false);
    };

    const handleBulkConfirm = async (data: SetUpdate, mode: BulkOperationMode) => {
        const ids = Array.from(selectedIds);
        try {
            if (modalType === 'delete') {
                await bulkDeleteMutation.mutateAsync({ data: ids });
                notifications.show({
                    title: 'Success',
                    message: `Successfully deleted ${ids.length} sets.`,
                    color: 'blue',
                });
            } else {
                await bulkUpdateMutation.mutateAsync({
                    data: {
                        set_ids: ids,
                        update_data: data,
                        operation_mode: mode
                    }
                });
                notifications.show({
                    title: 'Success',
                    message: `Successfully updated ${ids.length} sets.`,
                    color: 'blue',
                });
            }
            setModalType(null);
            clearSelection();
            refetch();
        } catch (err) {
            console.error('Bulk operation failed:', err);
            notifications.show({
                title: 'Error',
                message: 'Bulk operation failed. Please try again.',
                color: 'red',
            });
        }
    };

    const handleMergeConfirm = async (targetId: number) => {
        const sourceIds = Array.from(selectedIds).filter(id => id !== targetId);
        try {
            await mergeMutation.mutateAsync({
                data: {
                    source_ids: sourceIds,
                    target_id: targetId
                }
            });
            notifications.show({
                title: 'Merge Success',
                message: `Successfully merged ${sourceIds.length + 1} sets into one.`,
                color: 'green',
            });
            setIsMergeModalOpen(false);
            clearSelection();
            refetch();
        } catch (err) {
            console.error('Merge failed:', err);
            notifications.show({
                title: 'Merge Error',
                message: 'Failed to merge sets. Check if files are in use or on different drives.',
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
                                        <Button variant="subtle" size="xs" onClick={selectAllVisible}>
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
                                                    setSelectionMode(true);
                                                    setSelectedIds(new Set([set.id]));
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
                    <Pagination total={totalPages} value={page} onChange={setPage} withEdges />
                </Center>
            )}

            {/* Floating Bulk Action Bar */}
            <Transition mounted={selectionMode && selectedIds.size > 0} transition="slide-up" duration={400} timingFunction="ease">
                {(styles) => (
                    <Paper 
                        shadow="xl" 
                        p="md" 
                        withBorder 
                        style={{ 
                            ...styles,
                            position: 'fixed', 
                            bottom: 20, 
                            left: '50%', 
                            transform: 'translateX(-50%)',
                            zIndex: 100,
                            borderRadius: 100,
                            backgroundColor: 'var(--mantine-color-body)',
                            width: 'auto',
                            minWidth: 400
                        }}
                    >
                        <Group justify="space-between" wrap="nowrap">
                            <Group gap="sm">
                                <ActionIcon variant="subtle" color="gray" onClick={clearSelection} radius="xl">
                                    <IconX size={18} />
                                </ActionIcon>
                                <Text fw={600} size="sm">
                                    {selectedIds.size} items selected
                                </Text>
                            </Group>

                            <Group gap="xs">
                                {selectedIds.size >= 2 && (
                                    <Button 
                                        size="xs" 
                                        variant="light" 
                                        color="green"
                                        leftSection={<IconGitMerge size={14} />} 
                                        radius="xl"
                                        onClick={() => setIsMergeModalOpen(true)}
                                    >
                                        Merge
                                    </Button>
                                )}
                                <Button 
                                    size="xs" 
                                    variant="light" 
                                    leftSection={<IconUserEdit size={14} />} 
                                    radius="xl"
                                    onClick={() => setModalType('artist')}
                                >
                                    Artist
                                </Button>
                                <Button 
                                    size="xs" 
                                    variant="light" 
                                    leftSection={<IconTag size={14} />} 
                                    radius="xl"
                                    onClick={() => setModalType('tags')}
                                >
                                    Tags
                                </Button>
                                <Button 
                                    size="xs" 
                                    variant="light" 
                                    color="red" 
                                    leftSection={<IconTrash size={14} />} 
                                    radius="xl"
                                    onClick={() => setModalType('delete')}
                                >
                                    Delete
                                </Button>
                            </Group>
                        </Group>
                    </Paper>
                )}
            </Transition>

            {/* Bulk Edit Modal */}
            <SetBulkEditModal 
                key={modalType || 'none'}
                opened={modalType !== null}
                onClose={() => setModalType(null)}
                type={modalType || 'artist'}
                selectedCount={selectedIds.size}
                onConfirm={handleBulkConfirm}
                loading={bulkUpdateMutation.isPending || bulkDeleteMutation.isPending}
            />

            {/* Merge Sets Modal */}
            <MergeSetsModal 
                opened={isMergeModalOpen}
                onClose={() => setIsMergeModalOpen(false)}
                selectedSets={selectedSets}
                onConfirm={handleMergeConfirm}
                loading={mergeMutation.isPending}
            />
        </Container>
    );
}
