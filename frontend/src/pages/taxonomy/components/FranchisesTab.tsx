/**
 * @file Franchises tab component for taxonomy management.
 */
/* eslint-disable no-magic-numbers */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Table, Text, Badge, Group, ActionIcon, Tooltip, Checkbox, Modal, Stack, TextInput, Button, Select
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import {
    useReadFranchises, useCreateFranchise, useUpdateFranchise, useDeleteFranchise, useMergeFranchises, useBulkDeleteFranchises
} from '../../../api/taxonomy';
import type { Franchise } from '../../../api/taxonomy';
import { useTaxonomyFilterSort } from '../../../hooks/useTaxonomyFilterSort';
import { useTaxonomyCRUD } from '../hooks/useTaxonomyCRUD';
import { TaxonomyTable, SortableHeader } from './TaxonomyTable';

export function FranchisesTab() {
    const navigate = useNavigate();
    const { data: franchises, isLoading } = useReadFranchises(0, 1000);
    const createMutation = useCreateFranchise();
    const updateMutation = useUpdateFranchise();
    const deleteMutation = useDeleteFranchise();
    const mergeMutation = useMergeFranchises();
    const bulkDeleteMutation = useBulkDeleteFranchises();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');

    const { search, setSearch, sortBy, setSortBy, page, setPage, totalPages, totalItems, result: sortedFranchises } = useTaxonomyFilterSort(franchises);

    const crud = useTaxonomyCRUD({
        items: franchises,
        sortedItems: sortedFranchises,
        deleteEntity: (id) => deleteMutation.mutateAsync(id),
        mergeEntities: (sourceIds, targetId) => mergeMutation.mutateAsync({ source_ids: sourceIds, target_id: targetId }),
        bulkDeleteEntities: (ids) => bulkDeleteMutation.mutateAsync(ids),
        deleteTitle: 'Delete Franchise',
        deleteMessage: 'Are you sure you want to delete this franchise? Associated characters will lose their franchise link.'
    });

    const isFormDirty = useMemo(() => {
        if (editingId) {
            const original = franchises?.find(f => f.id === editingId);
            const originalName = original?.name || '';
            return name !== originalName;
        }
        return name.trim() !== '';
    }, [editingId, name, franchises]);

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
                    setEditingId(null);
                    setModalOpen(false);
                }
            });
        } else {
            setName('');
            setEditingId(null);
            setModalOpen(false);
        }
    };

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
        setName('');
        setEditingId(null);
        setModalOpen(false);
    };

    if (isLoading) return <Text>Loading...</Text>;

    const selectedFranchises = franchises?.filter(f => crud.selectedIds.has(f.id)) || [];

    return (
        <Stack>
            <TaxonomyTable
                searchPlaceholder="Search franchises..."
                search={search}
                onSearchChange={setSearch}
                selectedCount={crud.selectedIds.size}
                onMergeClick={() => { crud.setTargetId(null); crud.setMergeModalOpen(true); }}
                onBulkDeleteClick={crud.handleBulkDelete}
                onAddClick={handleOpenCreate}
                addLabel="Add Franchise"
                isAllSelected={crud.isAllSelected}
                isIndeterminate={crud.isIndeterminate}
                onSelectAll={crud.handleSelectAll}
                showingCount={sortedFranchises.length}
                totalCount={totalItems}
                entityNamePlural="franchises"
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                headerCells={
                    <>
                        <SortableHeader label="Name" sortKey="name" currentSortBy={sortBy} onSort={setSortBy} />
                        <SortableHeader label="Sets" sortKey="set_count" currentSortBy={sortBy} onSort={setSortBy} w={100} />
                        <SortableHeader label="Images" sortKey="image_count" currentSortBy={sortBy} onSort={setSortBy} w={100} />
                        <Table.Th w={100}>Actions</Table.Th>
                    </>
                }
            >
                {sortedFranchises.map(franchise => (
                    <Table.Tr key={franchise.id}>
                        <Table.Td>
                            <Checkbox 
                                checked={crud.selectedIds.has(franchise.id)}
                                onChange={() => crud.toggleSelect(franchise.id)}
                            />
                        </Table.Td>
                        <Table.Td>
                            <Text 
                                style={{ cursor: 'pointer', display: 'inline-block' }} 
                                c="blue" 
                                fw={500}
                                onClick={() => navigate(`/images?franchise=${encodeURIComponent(franchise.name)}`)}
                            >
                                {franchise.name}
                            </Text>
                        </Table.Td>
                        <Table.Td>
                            <Badge color="gray" variant="light">{franchise.set_count}</Badge>
                        </Table.Td>
                        <Table.Td>
                            <Badge color="blue" variant="light">{franchise.image_count}</Badge>
                        </Table.Td>
                        <Table.Td>
                            <Group gap="xs">
                                <Tooltip label="Edit Franchise">
                                    <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEdit(franchise)}>
                                        <IconEdit size={16} />
                                    </ActionIcon>
                                </Tooltip>
                                <ActionIcon variant="subtle" color="red" onClick={() => crud.handleDelete(franchise.id)}>
                                    <IconTrash size={16} />
                                </ActionIcon>
                            </Group>
                        </Table.Td>
                    </Table.Tr>
                ))}
                {!sortedFranchises.length && (
                    <Table.Tr>
                        <Table.Td colSpan={5} ta="center">No franchises found.</Table.Td>
                    </Table.Tr>
                )}
            </TaxonomyTable>

            <Modal opened={modalOpen} onClose={handleClose} title={editingId ? 'Edit Franchise' : 'Add Franchise'}>
                <Stack>
                    <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
                    <Button onClick={handleSave} disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}>
                        Save
                    </Button>
                </Stack>
            </Modal>

            <Modal opened={crud.mergeModalOpen} onClose={() => crud.setMergeModalOpen(false)} title="Merge Franchises">
                <Stack>
                    <Text size="sm">
                        Select the primary franchise. All other selected franchises will be merged into it and deleted.
                    </Text>
                    <Select
                        label="Primary Target"
                        data={selectedFranchises.map(f => ({ value: String(f.id), label: `${f.name} — ${f.set_count} sets [#${f.id}]` }))}
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
