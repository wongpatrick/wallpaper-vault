/**
 * @file Characters tab component for taxonomy management.
 */
/* eslint-disable no-magic-numbers */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Table, Text, Badge, Group, ActionIcon, Tooltip, Checkbox, Modal, Stack, TextInput, Autocomplete, Button, Select
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import {
    useReadCharacters, useCreateCharacter, useUpdateCharacter, useDeleteCharacter, useMergeCharacters, useBulkDeleteCharacters,
    useReadFranchises, useCreateFranchise
} from '../../../api/taxonomy';
import type { Character } from '../../../api/taxonomy';
import { useTaxonomyFilterSort } from '../../../hooks/useTaxonomyFilterSort';
import { useTaxonomyCRUD } from '../hooks/useTaxonomyCRUD';
import { TaxonomyTable, SortableHeader } from './TaxonomyTable';

export function CharactersTab() {
    const navigate = useNavigate();
    const { data: characters, isLoading } = useReadCharacters(0, 1000);
    const { data: franchises } = useReadFranchises(0, 1000);
    const createMutation = useCreateCharacter();
    const updateMutation = useUpdateCharacter();
    const deleteMutation = useDeleteCharacter();
    const mergeMutation = useMergeCharacters();
    const bulkDeleteMutation = useBulkDeleteCharacters();
    const createFranchiseMutation = useCreateFranchise();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [franchiseQuery, setFranchiseQuery] = useState('');

    const { search, setSearch, sortBy, setSortBy, page, setPage, totalPages, totalItems, result: sortedCharacters } = useTaxonomyFilterSort(characters);

    const crud = useTaxonomyCRUD({
        items: characters,
        sortedItems: sortedCharacters,
        deleteEntity: (id) => deleteMutation.mutateAsync(id),
        mergeEntities: (sourceIds, targetId) => mergeMutation.mutateAsync({ source_ids: sourceIds, target_id: targetId }),
        bulkDeleteEntities: (ids) => bulkDeleteMutation.mutateAsync(ids),
        deleteTitle: 'Delete Character',
        deleteMessage: 'Are you sure you want to delete this character? It will be removed from all associated sets.'
    });

    const franchiseOptions = useMemo(() => Array.from(new Set(franchises?.map(f => f.name) || [])), [franchises]);

    const isFormDirty = useMemo(() => {
        if (editingId) {
            const original = characters?.find(c => c.id === editingId);
            const originalName = original?.name || '';
            const originalFranchise = original?.franchise?.name || '';
            return name !== originalName || franchiseQuery !== originalFranchise;
        } else {
            return name.trim() !== '' || franchiseQuery.trim() !== '';
        }
    }, [editingId, name, franchiseQuery, characters]);

    const handleClose = () => {
        if (isFormDirty) {
            modals.openConfirmModal({
                title: 'Unsaved Changes',
                centered: true,
                children: <Text size="sm">You have unsaved changes. Do you want to discard them?</Text>,
                labels: { confirm: 'Discard Changes', cancel: 'Keep Editing' },
                confirmProps: { color: 'red' },
                onConfirm: () => {
                    setName('');
                    setFranchiseQuery('');
                    setEditingId(null);
                    setModalOpen(false);
                }
            });
        } else {
            setName('');
            setFranchiseQuery('');
            setEditingId(null);
            setModalOpen(false);
        }
    };

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
        setName('');
        setFranchiseQuery('');
        setEditingId(null);
        setModalOpen(false);
    };

    if (isLoading) return <Text>Loading...</Text>;

    const selectedCharacters = characters?.filter(c => crud.selectedIds.has(c.id)) || [];

    return (
        <Stack>
            <TaxonomyTable
                searchPlaceholder="Search characters..."
                search={search}
                onSearchChange={setSearch}
                selectedCount={crud.selectedIds.size}
                onMergeClick={() => { crud.setTargetId(null); crud.setMergeModalOpen(true); }}
                onBulkDeleteClick={crud.handleBulkDelete}
                onAddClick={handleOpenCreate}
                addLabel="Add Character"
                isAllSelected={crud.isAllSelected}
                isIndeterminate={crud.isIndeterminate}
                onSelectAll={crud.handleSelectAll}
                showingCount={sortedCharacters.length}
                totalCount={totalItems}
                entityNamePlural="characters"
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                headerCells={
                    <>
                        <SortableHeader label="Name" sortKey="name" currentSortBy={sortBy} onSort={setSortBy} />
                        <SortableHeader label="Franchise" sortKey="franchise" currentSortBy={sortBy} onSort={setSortBy} />
                        <SortableHeader label="Sets" sortKey="set_count" currentSortBy={sortBy} onSort={setSortBy} w={100} />
                        <SortableHeader label="Images" sortKey="image_count" currentSortBy={sortBy} onSort={setSortBy} w={100} />
                        <Table.Th w={100}>Actions</Table.Th>
                    </>
                }
            >
                {sortedCharacters.map(char => (
                    <Table.Tr key={char.id}>
                        <Table.Td>
                            <Checkbox 
                                checked={crud.selectedIds.has(char.id)}
                                onChange={() => crud.toggleSelect(char.id)}
                            />
                        </Table.Td>
                        <Table.Td>
                            <Text 
                                style={{ cursor: 'pointer', display: 'inline-block' }} 
                                c="blue" 
                                fw={500}
                                onClick={() => navigate(`/images?character=${encodeURIComponent(char.name)}`)}
                            >
                                {char.name}
                            </Text>
                        </Table.Td>
                        <Table.Td>
                            {char.franchise ? (
                                <Text 
                                    style={{ cursor: 'pointer', display: 'inline-block' }} 
                                    c="blue" 
                                    fw={500}
                                    onClick={() => navigate(`/images?franchise=${encodeURIComponent(char.franchise!.name)}`)}
                                >
                                    {char.franchise.name}
                                </Text>
                            ) : (
                                <Text c="dimmed" size="sm">None</Text>
                            )}
                        </Table.Td>
                        <Table.Td>
                            <Badge color="gray" variant="light">{char.set_count}</Badge>
                        </Table.Td>
                        <Table.Td>
                            <Badge color="blue" variant="light">{char.image_count}</Badge>
                        </Table.Td>
                        <Table.Td>
                            <Group gap="xs">
                                <Tooltip label="Edit Character">
                                    <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEdit(char)}>
                                        <IconEdit size={16} />
                                    </ActionIcon>
                                </Tooltip>
                                <ActionIcon variant="subtle" color="red" onClick={() => crud.handleDelete(char.id)}>
                                    <IconTrash size={16} />
                                </ActionIcon>
                            </Group>
                        </Table.Td>
                    </Table.Tr>
                ))}
                {!sortedCharacters.length && (
                    <Table.Tr>
                        <Table.Td colSpan={6} ta="center">No characters found.</Table.Td>
                    </Table.Tr>
                )}
            </TaxonomyTable>

            <Modal opened={modalOpen} onClose={handleClose} title={editingId ? 'Edit Character' : 'Add Character'}>
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

            <Modal opened={crud.mergeModalOpen} onClose={() => crud.setMergeModalOpen(false)} title="Merge Characters">
                <Stack>
                    <Text size="sm">
                        Select the primary character. All other selected characters will be merged into it and deleted.
                    </Text>
                    <Select
                        label="Primary Target"
                        data={selectedCharacters.map(c => ({ value: String(c.id), label: `${c.name}${c.franchise ? ` (${c.franchise.name})` : ''} — ${c.set_count} sets [#${c.id}]` }))}
                        value={crud.targetId}
                        onChange={crud.setTargetId}
                        required
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => crud.setMergeModalOpen(false)}>Cancel</Button>
                        <Button color="grape" onClick={crud.handleMerge} disabled={!crud.targetId || mergeMutation.isPending}>
                            Confirm Merge
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
