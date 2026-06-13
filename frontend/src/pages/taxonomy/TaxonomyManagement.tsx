/**
 * @file Taxonomy Management Page
 */
/* eslint-disable no-magic-numbers */
import { useState, useMemo } from 'react';
import { 
    Container, Title, Tabs, Table, Button, Group, ActionIcon, 
    TextInput, Modal, Stack, Text, Select, Box, Pagination, Badge
} from '@mantine/core';
import { IconEdit, IconTrash, IconPlus, IconSearch } from '@tabler/icons-react';
import { 
    useReadCharacters, useCreateCharacter, useUpdateCharacter, useDeleteCharacter,
    useReadFranchises, useCreateFranchise, useUpdateFranchise, useDeleteFranchise,
    useReadTagsManagement, useUpdateTag, useDeleteTag
} from '../../api/taxonomy';
import type { Character, Franchise, Tag } from '../../api/taxonomy';

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
function useTaxonomyFilterSort<T extends { name: string; set_count?: number }>(data: T[] | undefined) {
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

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [franchiseId, setFranchiseId] = useState<string | null>(null);

    const { search, setSearch, sortBy, setSortBy, page, setPage, totalPages, totalItems, result: sortedCharacters } = useTaxonomyFilterSort(characters);

    const franchiseOptions = franchises?.map(f => ({ value: String(f.id), label: f.name })) || [];

    const handleOpenCreate = () => {
        setEditingId(null);
        setName('');
        setFranchiseId(null);
        setModalOpen(true);
    };

    const handleOpenEdit = (char: Character) => {
        setEditingId(char.id);
        setName(char.name);
        setFranchiseId(char.franchise_id ? String(char.franchise_id) : null);
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!name.trim()) return;
        const payload = { 
            name: name.trim(), 
            franchise_id: franchiseId ? parseInt(franchiseId) : undefined 
        };

        if (editingId) {
            await updateMutation.mutateAsync({ id: editingId, data: payload });
        } else {
            await createMutation.mutateAsync(payload);
        }
        setModalOpen(false);
    };

    const handleDelete = async (id: number) => {
        if (confirm('Are you sure you want to delete this character? It will be removed from all associated sets.')) {
            await deleteMutation.mutateAsync(id);
        }
    };

    if (isLoading) return <Text>Loading...</Text>;

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
                    <Select
                        placeholder="Sort by"
                        data={[
                            { value: 'set_count_desc', label: 'Usage Count (High-Low)' },
                            { value: 'set_count_asc', label: 'Usage Count (Low-High)' },
                            { value: 'name_asc', label: 'Name (A-Z)' },
                            { value: 'name_desc', label: 'Name (Z-A)' },
                        ]}
                        value={sortBy}
                        onChange={setSortBy}
                        allowDeselect={false}
                        style={{ width: 150 }}
                    />
                </Group>
                <Button leftSection={<IconPlus size={16} />} onClick={handleOpenCreate}>
                    Add Character
                </Button>
            </Group>
            
            <Table.ScrollContainer minWidth={500}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Franchise</Table.Th>
                            <Table.Th w={100}>Sets</Table.Th>
                            <Table.Th w={100}>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {sortedCharacters.map(char => (
                            <Table.Tr key={char.id}>
                                <Table.Td>{char.name}</Table.Td>
                                <Table.Td>
                                    {char.franchise ? char.franchise.name : <Text c="dimmed" size="sm">None</Text>}
                                </Table.Td>
                                <Table.Td>
                                    <Badge color="gray" variant="light">{char.set_count}</Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs">
                                        <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEdit(char)}>
                                            <IconEdit size={16} />
                                        </ActionIcon>
                                        <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(char.id)}>
                                            <IconTrash size={16} />
                                        </ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                        {!sortedCharacters.length && (
                            <Table.Tr>
                                <Table.Td colSpan={4} ta="center">No characters found.</Table.Td>
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
                    <Select
                        label="Franchise"
                        placeholder="Select franchise..."
                        data={franchiseOptions}
                        value={franchiseId}
                        onChange={setFranchiseId}
                        clearable
                        searchable
                    />
                    <Button onClick={handleSave} disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}>
                        Save
                    </Button>
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

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');

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
        if (confirm('Are you sure you want to delete this franchise? Associated characters will lose their franchise link.')) {
            await deleteMutation.mutateAsync(id);
        }
    };

    if (isLoading) return <Text>Loading...</Text>;

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
                    <Select
                        placeholder="Sort by"
                        data={[
                            { value: 'set_count_desc', label: 'Usage Count (High-Low)' },
                            { value: 'set_count_asc', label: 'Usage Count (Low-High)' },
                            { value: 'name_asc', label: 'Name (A-Z)' },
                            { value: 'name_desc', label: 'Name (Z-A)' },
                        ]}
                        value={sortBy}
                        onChange={setSortBy}
                        allowDeselect={false}
                        style={{ width: 150 }}
                    />
                </Group>
                <Button leftSection={<IconPlus size={16} />} onClick={handleOpenCreate}>
                    Add Franchise
                </Button>
            </Group>
            
            <Table.ScrollContainer minWidth={500}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th w={100}>Sets</Table.Th>
                            <Table.Th w={100}>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {sortedFranchises.map(franchise => (
                            <Table.Tr key={franchise.id}>
                                <Table.Td>{franchise.name}</Table.Td>
                                <Table.Td>
                                    <Badge color="gray" variant="light">{franchise.set_count}</Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs">
                                        <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEdit(franchise)}>
                                            <IconEdit size={16} />
                                        </ActionIcon>
                                        <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(franchise.id)}>
                                            <IconTrash size={16} />
                                        </ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                        {!sortedFranchises.length && (
                            <Table.Tr>
                                <Table.Td colSpan={3} ta="center">No franchises found.</Table.Td>
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
        </Stack>
    );
}

// --- Tags Tab ---
function TagsTab() {
    const { data: tags, isLoading } = useReadTagsManagement(0, 1000);
    const updateMutation = useUpdateTag();
    const deleteMutation = useDeleteTag();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);

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
        if (confirm('Are you sure you want to delete this tag? It will be removed from all sets.')) {
            await deleteMutation.mutateAsync(id);
        }
    };

    if (isLoading) return <Text>Loading...</Text>;

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
                    <Select
                        placeholder="Sort by"
                        data={[
                            { value: 'set_count_desc', label: 'Usage Count (High-Low)' },
                            { value: 'set_count_asc', label: 'Usage Count (Low-High)' },
                            { value: 'name_asc', label: 'Name (A-Z)' },
                            { value: 'name_desc', label: 'Name (Z-A)' },
                        ]}
                        value={sortBy}
                        onChange={setSortBy}
                        allowDeselect={false}
                        style={{ width: 150 }}
                    />
                </Group>
            </Group>

            <Table.ScrollContainer minWidth={500}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Name</Table.Th>
                            <Table.Th w={100}>Sets</Table.Th>
                            <Table.Th w={100}>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {sortedTags.map(tag => (
                            <Table.Tr key={tag.id}>
                                <Table.Td>{tag.name}</Table.Td>
                                <Table.Td>
                                    <Badge color="gray" variant="light">{tag.set_count}</Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs">
                                        <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEdit(tag)}>
                                            <IconEdit size={16} />
                                        </ActionIcon>
                                        <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(tag.id)}>
                                            <IconTrash size={16} />
                                        </ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                        {!sortedTags.length && (
                            <Table.Tr>
                                <Table.Td colSpan={3} ta="center">No tags found.</Table.Td>
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
        </Stack>
    );
}
