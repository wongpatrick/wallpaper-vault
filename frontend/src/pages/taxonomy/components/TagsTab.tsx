/**
 * @file Tags tab component for taxonomy management.
 */
/* eslint-disable no-magic-numbers */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Table, Text, Badge, Group, ActionIcon, Tooltip, Checkbox, Modal, Stack, TextInput, Button, Select, Box
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import {
    useReadTagsManagement, useUpdateTag, useDeleteTag, useMergeTags, useBulkDeleteTags
} from '../../../api/taxonomy';
import type { Tag } from '../../../api/taxonomy';
import { useTaxonomyFilterSort } from '../../../hooks/useTaxonomyFilterSort';
import { useTaxonomyCRUD } from '../hooks/useTaxonomyCRUD';
import { TaxonomyTable, SortableHeader } from './TaxonomyTable';

export function TagsTab() {
    const navigate = useNavigate();
    const { data: tags, isLoading } = useReadTagsManagement(0, 1000);
    const updateMutation = useUpdateTag();
    const deleteMutation = useDeleteTag();
    const mergeMutation = useMergeTags();
    const bulkDeleteMutation = useBulkDeleteTags();

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const { search, setSearch, sortBy, setSortBy, page, setPage, totalPages, totalItems, result: sortedTags } = useTaxonomyFilterSort(tags);

    const crud = useTaxonomyCRUD({
        items: tags,
        sortedItems: sortedTags,
        deleteEntity: (id) => deleteMutation.mutateAsync(id),
        mergeEntities: (sourceIds, targetId) => mergeMutation.mutateAsync({ source_ids: sourceIds, target_id: targetId }),
        bulkDeleteEntities: (ids) => bulkDeleteMutation.mutateAsync(ids),
        deleteTitle: 'Delete Tag',
        deleteMessage: 'Are you sure you want to delete this tag? It will be removed from all sets.'
    });

    const isFormDirty = useMemo(() => {
        if (editingId) {
            const original = tags?.find(t => t.id === editingId);
            const originalName = original?.name || '';
            return name !== originalName;
        }
        return false;
    }, [editingId, name, tags]);

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
                    setError(null);
                    setEditingId(null);
                    setModalOpen(false);
                }
            });
        } else {
            setName('');
            setError(null);
            setEditingId(null);
            setModalOpen(false);
        }
    };

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
            setName('');
            setError(null);
            setEditingId(null);
            setModalOpen(false);
        } catch (e) {
            // @ts-expect-error - e is unknown but may have response.data.detail
            setError(e?.response?.data?.detail || "Failed to update tag.");
        }
    };

    if (isLoading) return <Text>Loading...</Text>;

    const selectedTags = tags?.filter(t => crud.selectedIds.has(t.id)) || [];

    return (
        <Stack>
            <Box mb="md">
                <Text c="dimmed">Tags are currently created automatically when added to images or sets. You can rename or delete them here.</Text>
            </Box>

            <TaxonomyTable
                searchPlaceholder="Search tags..."
                search={search}
                onSearchChange={setSearch}
                selectedCount={crud.selectedIds.size}
                onMergeClick={() => { crud.setTargetId(null); crud.setMergeModalOpen(true); }}
                onBulkDeleteClick={crud.handleBulkDelete}
                isAllSelected={crud.isAllSelected}
                isIndeterminate={crud.isIndeterminate}
                onSelectAll={crud.handleSelectAll}
                showingCount={sortedTags.length}
                totalCount={totalItems}
                entityNamePlural="tags"
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
                {sortedTags.map(tag => (
                    <Table.Tr key={tag.id}>
                        <Table.Td>
                            <Checkbox 
                                checked={crud.selectedIds.has(tag.id)}
                                onChange={() => crud.toggleSelect(tag.id)}
                            />
                        </Table.Td>
                        <Table.Td>
                            <Text 
                                style={{ cursor: 'pointer', display: 'inline-block' }} 
                                c="blue" 
                                fw={500}
                                onClick={() => navigate(`/images?tag=${encodeURIComponent(tag.name)}`)}
                            >
                                {tag.name}
                            </Text>
                        </Table.Td>
                        <Table.Td>
                            <Badge color="gray" variant="light">{tag.set_count}</Badge>
                        </Table.Td>
                        <Table.Td>
                            <Badge color="blue" variant="light">{tag.image_count}</Badge>
                        </Table.Td>
                        <Table.Td>
                            <Group gap="xs">
                                <Tooltip label="Edit Tag">
                                    <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEdit(tag)}>
                                        <IconEdit size={16} />
                                    </ActionIcon>
                                </Tooltip>
                                <ActionIcon variant="subtle" color="red" onClick={() => crud.handleDelete(tag.id)}>
                                    <IconTrash size={16} />
                                </ActionIcon>
                            </Group>
                        </Table.Td>
                    </Table.Tr>
                ))}
                {!sortedTags.length && (
                    <Table.Tr>
                        <Table.Td colSpan={5} ta="center">No tags found.</Table.Td>
                    </Table.Tr>
                )}
            </TaxonomyTable>

            <Modal opened={modalOpen} onClose={handleClose} title="Edit Tag">
                <Stack>
                    {error && <Text c="red" size="sm">{error}</Text>}
                    <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
                    <Button onClick={handleSave} disabled={!name.trim() || updateMutation.isPending}>
                        Save
                    </Button>
                </Stack>
            </Modal>

            <Modal opened={crud.mergeModalOpen} onClose={() => crud.setMergeModalOpen(false)} title="Merge Tags">
                <Stack>
                    <Text size="sm">
                        Select the primary tag. All other selected tags will be merged into it and deleted.
                    </Text>
                    <Select
                        label="Primary Target"
                        data={selectedTags.map(t => ({ value: String(t.id), label: `${t.name} — ${t.set_count} sets [#${t.id}]` }))}
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
