/**
 * @file Taxonomy Management Page
 */
/* eslint-disable no-magic-numbers */
import { useState, useMemo } from 'react';
import { 
    Container, Title, Tabs, Table, Button, Group, ActionIcon, 
    TextInput, Modal, Stack, Text, Select, Box, Pagination, Badge,
    Checkbox, Autocomplete, Tooltip
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconEdit, IconTrash, IconPlus, IconSearch, IconSortAscending, IconSortDescending, IconArrowsSort } from '@tabler/icons-react';
import { 
    useReadCharacters, useCreateCharacter, useUpdateCharacter, useDeleteCharacter, useMergeCharacters,
    useReadFranchises, useCreateFranchise, useUpdateFranchise, useDeleteFranchise, useMergeFranchises,
    useReadTagsManagement, useUpdateTag, useDeleteTag, useMergeTags
} from '../../api/taxonomy';
import type { Character, Franchise, Tag } from '../../api/taxonomy';

function SortableHeader({ label, sortKey, currentSortBy, onSort, w }: { label: string, sortKey: string, currentSortBy: string | null, onSort: (val: string) => void, w?: number }) {
    const isAsc = currentSortBy === `${sortKey}_asc`;
    const isDesc = currentSortBy === `${sortKey}_desc`;
    const Icon = isAsc ? IconSortAscending : isDesc ? IconSortDescending : IconArrowsSort;
    return (
        <Table.Th onClick={() => onSort(isAsc ? `${sortKey}_desc` : `${sortKey}_asc`)} style={{ cursor: 'pointer', userSelect: 'none' }} w={w}>
            <Group gap="xs" wrap="nowrap">
                <Text fw={700} size="sm">{label}</Text>
                <Icon size={14} style={{ opacity: isAsc || isDesc ? 1 : 0.3 }} />
            </Group>
        </Table.Th>
    );
}


export default function TaxonomyManagement() {
    return (
        <Container fluid px="xl">
            <Group justify="space-between" mb="lg">
                <Title order={2}>Taxonomy Management</Title>
            </Group>

            <Tabs defaultValue="characters">
                <Tabs.List mb="md">
                    <Tabs.Tab value="characters">Characters</Tabs.Tab>
                    <Tabs.Tab value="franchises">Franchises</Tabs.Tab>
                    <Tabs.Tab value="tags">Tags</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="characters">
                    <CharactersTab />
                </Tabs.Panel>

                <Tabs.Panel value="franchises">
                    <FranchisesTab />
                </Tabs.Panel>

                <Tabs.Panel value="tags">
                    <TagsTab />
                </Tabs.Panel>
            </Tabs>
        </Container>
    );
}

// --- Common Filtering/Sorting Hook ---
function useTaxonomyFilterSort<T extends { name: string; set_count?: number; franchise?: { name: string } | null }>(data: T[] | undefined) {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<string | null>('set_count_desc');
    const [page, setPage] = useState(1);
    const pageSize = 15;

    const filteredAndSorted = useMemo(() => {
        if (!data) return [];
        let filtered = data;
        
        if (search.trim()) {
            const s = search.toLowerCase();
            filtered = filtered.filter(item => item.name.toLowerCase().includes(s));
        }

        return [...filtered].sort((a, b) => {
            if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
            if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
            if (sortBy === 'set_count_desc') return (b.set_count || 0) - (a.set_count || 0);
            if (sortBy === 'set_count_asc') return (a.set_count || 0) - (b.set_count || 0);
            if (sortBy === 'franchise_asc') {
                const fa = a.franchise?.name || '';
                const fb = b.franchise?.name || '';
                return fa.localeCompare(fb);
            }
            if (sortBy === 'franchise_desc') {
                const fa = a.franchise?.name || '';
                const fb = b.franchise?.name || '';
                return fb.localeCompare(fa);
            }
            return 0;
        });
    }, [data, search, sortBy]);

    const totalPages = Math.ceil(filteredAndSorted.length / pageSize);
    const paginatedResult = filteredAndSorted.slice((page - 1) * pageSize, page * pageSize);

    const handleSearchChange = (val: string) => {
        setSearch(val);
        setPage(1);
    };

    const handleSortChange = (val: string | null) => {
        setSortBy(val);
        setPage(1);
    };

    return { 
        search, setSearch: handleSearchChange, 
        sortBy, setSortBy: handleSortChange, 
        page, setPage, totalPages,
        totalItems: filteredAndSorted.length,
        result: paginatedResult 
    };
}

// --- Characters Tab ---
function CharactersTab() {
    const { data: characters, isLoading } = useReadCharacters(0, 1000);
    const { data: franchises } = useReadFranchises(0, 1000);
    const createMutation = useCreateCharacter();
    const updateMutation = useUpdateCharacter();
    const deleteMutation = useDeleteCharacter();
    const mergeMutation = useMergeCharacters();
    const createFranchiseMutation = useCreateFranchise();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [franchiseQuery, setFranchiseQuery] = useState('');

    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [mergeModalOpen, setMergeModalOpen] = useState(false);
    const [targetId, setTargetId] = useState<string | null>(null);

    const { search, setSearch, sortBy, setSortBy, page, setPage, totalPages, totalItems, result: sortedCharacters } = useTaxonomyFilterSort(characters);

    const franchiseOptions = useMemo(() => Array.from(new Set(franchises?.map(f => f.name) || [])), [franchises]);

    const handleOpenCreate = () => {
        setEditingId(null);
        setName('');
        setFranchiseQuery('');
        setModalOpen(true);
    };

    const handleOpenEdit = (char: Character) => {
        setEditingId(char.id);
        setName(char.name);
        setFranchiseQuery(char.franchise ? char.franchise.name : '');
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!name.trim()) return;
        
        let finalFranchiseId: number | undefined = undefined;
        if (franchiseQuery.trim()) {
            const existing = franchises?.find(f => f.name.toLowerCase() === franchiseQuery.trim().toLowerCase());
            if (existing) {
                finalFranchiseId = existing.id;
            } else {
                const newF = await createFranchiseMutation.mutateAsync({ name: franchiseQuery.trim() });
                finalFranchiseId = newF.id;
            }
        }

        const payload = { 
            name: name.trim(), 
            franchise_id: finalFranchiseId
        };

        if (editingId) {
            await updateMutation.mutateAsync({ id: editingId, data: payload });
        } else {
            await createMutation.mutateAsync(payload);
        }
        setModalOpen(false);
    };

    const handleDelete = async (id: number) => {
        modals.openConfirmModal({
            title: 'Delete Character',
            centered: true,
            children: (
                <Text size="sm">
                    Are you sure you want to delete this character? It will be removed from all associated sets.
                </Text>
            ),
            labels: { confirm: 'Delete', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                await deleteMutation.mutateAsync(id);
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            },
        });
    };

    const handleMerge = async () => {
        if (!targetId || selectedIds.size < 2) return;
        const target = parseInt(targetId);
        const sourceIds = Array.from(selectedIds).filter(id => id !== target);
        if (sourceIds.length === 0) return;

        await mergeMutation.mutateAsync({ source_ids: sourceIds, target_id: target });
        setMergeModalOpen(false);
        setSelectedIds(new Set());
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(sortedCharacters.map(c => c.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (isLoading) return <Text>Loading...</Text>;

    const isAllSelected = sortedCharacters.length > 0 && selectedIds.size === sortedCharacters.length;
    const isIndeterminate = selectedIds.size > 0 && selectedIds.size < sortedCharacters.length;

    const selectedCharacters = characters?.filter(c => selectedIds.has(c.id)) || [];

    return (
        <Stack>
            <Group justify="space-between" align="center" style={{ flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)' }}>
                <Group style={{ flex: 1, flexWrap: 'wrap' }}>
                    <TextInput 
                        placeholder="Search characters..." 
                        leftSection={<IconSearch size={16} />}
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        style={{ width: 250 }}
                    />
                    {selectedIds.size >= 2 && (
                        <Button color="grape" onClick={() => { setTargetId(null); setMergeModalOpen(true); }}>
                            Merge Selected ({selectedIds.size})
                        </Button>
                    )}
                </Group>
                <Button leftSection={<IconPlus size={16} />} onClick={handleOpenCreate}>
                    Add Character
                </Button>
            </Group>
            
            <Table.ScrollContainer minWidth={500}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th w={40}>
                                <Checkbox 
                                    checked={isAllSelected}
                                    indeterminate={isIndeterminate}
                                    onChange={(e) => handleSelectAll(e.currentTarget.checked)}
                                />
                            </Table.Th>
                            <SortableHeader label="Name" sortKey="name" currentSortBy={sortBy} onSort={setSortBy} />
                            <SortableHeader label="Franchise" sortKey="franchise" currentSortBy={sortBy} onSort={setSortBy} />
                            <SortableHeader label="Sets" sortKey="set_count" currentSortBy={sortBy} onSort={setSortBy} w={100} />
                            <Table.Th w={100}>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {sortedCharacters.map(char => (
                            <Table.Tr key={char.id}>
                                <Table.Td>
                                    <Checkbox 
                                        checked={selectedIds.has(char.id)}
                                        onChange={() => toggleSelect(char.id)}
                                    />
                                </Table.Td>
                                <Table.Td>{char.name}</Table.Td>
                                <Table.Td>
                                    {char.franchise ? char.franchise.name : <Text c="dimmed" size="sm">None</Text>}
                                </Table.Td>
                                <Table.Td>
                                    <Badge color="gray" variant="light">{char.set_count}</Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs">
                                        <Tooltip label="Edit Character">
                                            <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEdit(char)}>
                                                <IconEdit size={16} />
                                            </ActionIcon>
                                        </Tooltip>
                                        <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(char.id)}>
                                            <IconTrash size={16} />
                                        </ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                        {!sortedCharacters.length && (
                            <Table.Tr>
                                <Table.Td colSpan={5} ta="center">No characters found.</Table.Td>
                            </Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>

            <Group justify="space-between" mt="md">
                <Text size="sm" c="dimmed">Showing {sortedCharacters.length} of {totalItems} characters</Text>
                {totalPages > 1 && (
                    <Pagination total={totalPages} value={page} onChange={setPage} />
                )}
            </Group>

            <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Character' : 'Add Character'}>
                <Stack>
                    <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
                    <Autocomplete
                        label="Franchise"
                        placeholder="Search or create franchise..."
                        data={franchiseOptions}
                        value={franchiseQuery}
                        onChange={setFranchiseQuery}
                        description="If you type a new name, it will be created automatically."
                    />
                    <Button onClick={handleSave} disabled={!name.trim() || createMutation.isPending || updateMutation.isPending || createFranchiseMutation.isPending}>
                        Save
                    </Button>
                </Stack>
            </Modal>

            <Modal opened={mergeModalOpen} onClose={() => setMergeModalOpen(false)} title="Merge Characters">
                <Stack>
                    <Text size="sm">
                        Select the primary character. All other selected characters will be merged into it and deleted.
                    </Text>
                    <Select
                        label="Primary Target"
                        data={selectedCharacters.map(c => ({ value: String(c.id), label: c.name }))}
                        value={targetId}
                        onChange={setTargetId}
                        required
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setMergeModalOpen(false)}>Cancel</Button>
                        <Button color="grape" onClick={handleMerge} disabled={!targetId || mergeMutation.isPending}>
                            Confirm Merge
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}

// --- Franchises Tab ---
function FranchisesTab() {
    const { data: franchises, isLoading } = useReadFranchises(0, 1000);
    const createMutation = useCreateFranchise();
    const updateMutation = useUpdateFranchise();
    const deleteMutation = useDeleteFranchise();
    const mergeMutation = useMergeFranchises();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');

    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [mergeModalOpen, setMergeModalOpen] = useState(false);
    const [targetId, setTargetId] = useState<string | null>(null);

    const { search, setSearch, sortBy, setSortBy, page, setPage, totalPages, totalItems, result: sortedFranchises } = useTaxonomyFilterSort(franchises);

    const handleOpenCreate = () => {
        setEditingId(null);
        setName('');
        setModalOpen(true);
    };

    const handleOpenEdit = (franchise: Franchise) => {
        setEditingId(franchise.id);
        setName(franchise.name);
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!name.trim()) return;
        const payload = { name: name.trim() };

        if (editingId) {
            await updateMutation.mutateAsync({ id: editingId, data: payload });
        } else {
            await createMutation.mutateAsync(payload);
        }
        setModalOpen(false);
    };

    const handleDelete = async (id: number) => {
        modals.openConfirmModal({
            title: 'Delete Franchise',
            centered: true,
            children: (
                <Text size="sm">
                    Are you sure you want to delete this franchise? Associated characters will lose their franchise link.
                </Text>
            ),
            labels: { confirm: 'Delete', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                await deleteMutation.mutateAsync(id);
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            },
        });
    };

    const handleMerge = async () => {
        if (!targetId || selectedIds.size < 2) return;
        const target = parseInt(targetId);
        const sourceIds = Array.from(selectedIds).filter(id => id !== target);
        if (sourceIds.length === 0) return;

        await mergeMutation.mutateAsync({ source_ids: sourceIds, target_id: target });
        setMergeModalOpen(false);
        setSelectedIds(new Set());
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(sortedFranchises.map(f => f.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (isLoading) return <Text>Loading...</Text>;

    const isAllSelected = sortedFranchises.length > 0 && selectedIds.size === sortedFranchises.length;
    const isIndeterminate = selectedIds.size > 0 && selectedIds.size < sortedFranchises.length;
    const selectedFranchises = franchises?.filter(f => selectedIds.has(f.id)) || [];

    return (
        <Stack>
            <Group justify="space-between" align="center" style={{ flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)' }}>
                <Group style={{ flex: 1, flexWrap: 'wrap' }}>
                    <TextInput 
                        placeholder="Search franchises..." 
                        leftSection={<IconSearch size={16} />}
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        style={{ width: 250 }}
                    />
                    {selectedIds.size >= 2 && (
                        <Button color="grape" onClick={() => { setTargetId(null); setMergeModalOpen(true); }}>
                            Merge Selected ({selectedIds.size})
                        </Button>
                    )}
                </Group>
                <Button leftSection={<IconPlus size={16} />} onClick={handleOpenCreate}>
                    Add Franchise
                </Button>
            </Group>
            
            <Table.ScrollContainer minWidth={500}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th w={40}>
                                <Checkbox 
                                    checked={isAllSelected}
                                    indeterminate={isIndeterminate}
                                    onChange={(e) => handleSelectAll(e.currentTarget.checked)}
                                />
                            </Table.Th>
                            <SortableHeader label="Name" sortKey="name" currentSortBy={sortBy} onSort={setSortBy} />
                            <SortableHeader label="Sets" sortKey="set_count" currentSortBy={sortBy} onSort={setSortBy} w={100} />
                            <Table.Th w={100}>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {sortedFranchises.map(franchise => (
                            <Table.Tr key={franchise.id}>
                                <Table.Td>
                                    <Checkbox 
                                        checked={selectedIds.has(franchise.id)}
                                        onChange={() => toggleSelect(franchise.id)}
                                    />
                                </Table.Td>
                                <Table.Td>{franchise.name}</Table.Td>
                                <Table.Td>
                                    <Badge color="gray" variant="light">{franchise.set_count}</Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs">
                                        <Tooltip label="Edit Franchise">
                                            <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEdit(franchise)}>
                                                <IconEdit size={16} />
                                            </ActionIcon>
                                        </Tooltip>
                                        <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(franchise.id)}>
                                            <IconTrash size={16} />
                                        </ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                        {!sortedFranchises.length && (
                            <Table.Tr>
                                <Table.Td colSpan={4} ta="center">No franchises found.</Table.Td>
                            </Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>

            <Group justify="space-between" mt="md">
                <Text size="sm" c="dimmed">Showing {sortedFranchises.length} of {totalItems} franchises</Text>
                {totalPages > 1 && (
                    <Pagination total={totalPages} value={page} onChange={setPage} />
                )}
            </Group>

            <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Franchise' : 'Add Franchise'}>
                <Stack>
                    <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
                    <Button onClick={handleSave} disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}>
                        Save
                    </Button>
                </Stack>
            </Modal>

            <Modal opened={mergeModalOpen} onClose={() => setMergeModalOpen(false)} title="Merge Franchises">
                <Stack>
                    <Text size="sm">
                        Select the primary franchise. All other selected franchises will be merged into it and deleted.
                    </Text>
                    <Select
                        label="Primary Target"
                        data={selectedFranchises.map(f => ({ value: String(f.id), label: f.name }))}
                        value={targetId}
                        onChange={setTargetId}
                        required
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setMergeModalOpen(false)}>Cancel</Button>
                        <Button color="grape" onClick={handleMerge} disabled={!targetId || mergeMutation.isPending}>
                            Confirm Merge
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}

// --- Tags Tab ---
function TagsTab() {
    const { data: tags, isLoading } = useReadTagsManagement(0, 1000);
    const updateMutation = useUpdateTag();
    const deleteMutation = useDeleteTag();
    const mergeMutation = useMergeTags();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [mergeModalOpen, setMergeModalOpen] = useState(false);
    const [targetId, setTargetId] = useState<string | null>(null);

    const { search, setSearch, sortBy, setSortBy, page, setPage, totalPages, totalItems, result: sortedTags } = useTaxonomyFilterSort(tags);

    const handleOpenEdit = (tag: Tag) => {
        setEditingId(tag.id);
        setName(tag.name);
        setError(null);
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!name.trim() || !editingId) return;
        setError(null);
        try {
            await updateMutation.mutateAsync({ id: editingId, data: { name: name.trim() } });
            setModalOpen(false);
        } catch (e) {
            // @ts-expect-error - e is unknown but may have response.data.detail
            setError(e?.response?.data?.detail || "Failed to update tag.");
        }
    };

    const handleDelete = async (id: number) => {
        modals.openConfirmModal({
            title: 'Delete Tag',
            centered: true,
            children: (
                <Text size="sm">
                    Are you sure you want to delete this tag? It will be removed from all sets.
                </Text>
            ),
            labels: { confirm: 'Delete', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                await deleteMutation.mutateAsync(id);
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            },
        });
    };

    const handleMerge = async () => {
        if (!targetId || selectedIds.size < 2) return;
        const target = parseInt(targetId);
        const sourceIds = Array.from(selectedIds).filter(id => id !== target);
        if (sourceIds.length === 0) return;

        await mergeMutation.mutateAsync({ source_ids: sourceIds, target_id: target });
        setMergeModalOpen(false);
        setSelectedIds(new Set());
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(sortedTags.map(t => t.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (isLoading) return <Text>Loading...</Text>;

    const isAllSelected = sortedTags.length > 0 && selectedIds.size === sortedTags.length;
    const isIndeterminate = selectedIds.size > 0 && selectedIds.size < sortedTags.length;
    const selectedTags = tags?.filter(t => selectedIds.has(t.id)) || [];

    return (
        <Stack>
            <Box mb="md">
                <Text c="dimmed">Tags are currently created automatically when added to images or sets. You can rename or delete them here.</Text>
            </Box>

            <Group justify="space-between" align="center" style={{ flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)' }}>
                <Group style={{ flex: 1, flexWrap: 'wrap' }}>
                    <TextInput 
                        placeholder="Search tags..." 
                        leftSection={<IconSearch size={16} />}
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        style={{ width: 250 }}
                    />
                    {selectedIds.size >= 2 && (
                        <Button color="grape" onClick={() => { setTargetId(null); setMergeModalOpen(true); }}>
                            Merge Selected ({selectedIds.size})
                        </Button>
                    )}
                </Group>
            </Group>

            <Table.ScrollContainer minWidth={500}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th w={40}>
                                <Checkbox 
                                    checked={isAllSelected}
                                    indeterminate={isIndeterminate}
                                    onChange={(e) => handleSelectAll(e.currentTarget.checked)}
                                />
                            </Table.Th>
                            <SortableHeader label="Name" sortKey="name" currentSortBy={sortBy} onSort={setSortBy} />
                            <SortableHeader label="Sets" sortKey="set_count" currentSortBy={sortBy} onSort={setSortBy} w={100} />
                            <Table.Th w={100}>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {sortedTags.map(tag => (
                            <Table.Tr key={tag.id}>
                                <Table.Td>
                                    <Checkbox 
                                        checked={selectedIds.has(tag.id)}
                                        onChange={() => toggleSelect(tag.id)}
                                    />
                                </Table.Td>
                                <Table.Td>{tag.name}</Table.Td>
                                <Table.Td>
                                    <Badge color="gray" variant="light">{tag.set_count}</Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs">
                                        <Tooltip label="Edit Tag">
                                            <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEdit(tag)}>
                                                <IconEdit size={16} />
                                            </ActionIcon>
                                        </Tooltip>
                                        <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(tag.id)}>
                                            <IconTrash size={16} />
                                        </ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                        {!sortedTags.length && (
                            <Table.Tr>
                                <Table.Td colSpan={4} ta="center">No tags found.</Table.Td>
                            </Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>

            <Group justify="space-between" mt="md">
                <Text size="sm" c="dimmed">Showing {sortedTags.length} of {totalItems} tags</Text>
                {totalPages > 1 && (
                    <Pagination total={totalPages} value={page} onChange={setPage} />
                )}
            </Group>

            <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Edit Tag">
                <Stack>
                    {error && <Text c="red" size="sm">{error}</Text>}
                    <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
                    <Button onClick={handleSave} disabled={!name.trim() || updateMutation.isPending}>
                        Save
                    </Button>
                </Stack>
            </Modal>

            <Modal opened={mergeModalOpen} onClose={() => setMergeModalOpen(false)} title="Merge Tags">
                <Stack>
                    <Text size="sm">
                        Select the primary tag. All other selected tags will be merged into it and deleted.
                    </Text>
                    <Select
                        label="Primary Target"
                        data={selectedTags.map(t => ({ value: String(t.id), label: t.name }))}
                        value={targetId}
                        onChange={setTargetId}
                        required
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setMergeModalOpen(false)}>Cancel</Button>
                        <Button color="grape" onClick={handleMerge} disabled={!targetId || mergeMutation.isPending}>
                            Confirm Merge
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
