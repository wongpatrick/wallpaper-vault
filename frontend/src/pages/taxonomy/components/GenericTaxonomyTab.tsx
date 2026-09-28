/**
 * @file Generic reusable taxonomy tab component for Characters, Franchises, Tags.
 */
/* eslint-disable no-magic-numbers */
import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Table, Text, Badge, Group, ActionIcon, Tooltip, Checkbox, Modal, Stack, TextInput, Button, Select, Alert, Box
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { useQueryClient } from '@tanstack/react-query';
import { IconEdit, IconTrash, IconAlertCircle } from '@tabler/icons-react';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import { useTaxonomyFilterSort, type TaxonomyQueryParams } from '../../../hooks/useTaxonomyFilterSort';
import { useTaxonomyCRUD } from '../hooks/useTaxonomyCRUD';
import { TaxonomyTable, SortableHeader } from './TaxonomyTable';

export interface TaxonomyEntity {
    id: number;
    name: string;
    set_count?: number;
    image_count?: number;
}

export interface RenderEditFieldsProps<T extends TaxonomyEntity, TExtra = unknown> {
    item: T | null;
    name: string;
    setName: (name: string) => void;
    extraState: TExtra;
    setExtraState: React.Dispatch<React.SetStateAction<TExtra>>;
}

export interface TaxonomyConfig<T extends TaxonomyEntity, TExtra = unknown> {
    entityName: string;
    entityNamePlural: string;
    searchPlaceholder?: string;
    deleteMessage?: string;
    allowCreate?: boolean;
    infoBanner?: ReactNode;
    mainQueryKey: readonly unknown[];
    additionalInvalidateKeys?: readonly (readonly unknown[])[];

    useRead: (params: TaxonomyQueryParams) => {
        data?: { items?: T[]; total?: number };
        isLoading: boolean;
    };
    onDelete: (id: number) => Promise<unknown>;
    onMerge: (sourceIds: number[], targetId: number) => Promise<unknown>;
    onBulkDelete: (ids: number[]) => Promise<unknown>;
    onCreate?: (name: string, extraState: TExtra) => Promise<unknown>;
    onUpdate: (id: number, name: string, extraState: TExtra) => Promise<unknown>;

    getFilterUrl: (item: T) => string;
    extraColumnsCount?: number;
    extraHeaderCells?: (props: { sortBy: string | null; setSortBy: (val: string | null) => void }) => ReactNode;
    renderExtraCells?: (item: T) => ReactNode;

    getInitialExtraState?: (item: T | null) => TExtra;
    isExtraDirty?: (original: T | null, extraState: TExtra) => boolean;
    renderEditFields?: (props: RenderEditFieldsProps<T, TExtra>) => ReactNode;
    getMergeOptionLabel?: (item: T) => string;
    isSaving?: boolean;
}

export function GenericTaxonomyTab<T extends TaxonomyEntity, TExtra = unknown>({
    config
}: {
    config: TaxonomyConfig<T, TExtra>;
}) {
    const { showNotification } = useAppNotifications();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const filterSort = useTaxonomyFilterSort(25);
    const { search, setSearch, sortBy, setSortBy, page, setPage, getTotalPages, queryParams } = filterSort;

    const { data, isLoading } = config.useRead(queryParams);
    const items = useMemo(() => data?.items || [], [data?.items]);
    const totalItems = data?.total || 0;
    const totalPages = getTotalPages(totalItems);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [extraState, setExtraState] = useState<TExtra>(() => (config.getInitialExtraState ? config.getInitialExtraState(null) : ({} as TExtra)));
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const invalidateAll = () => {
        queryClient.invalidateQueries({ queryKey: config.mainQueryKey });
        if (config.additionalInvalidateKeys) {
            for (const key of config.additionalInvalidateKeys) {
                queryClient.invalidateQueries({ queryKey: key });
            }
        }
    };

    const crud = useTaxonomyCRUD<T>({
        sortedItems: items,
        deleteEntity: async (id) => {
            try {
                await config.onDelete(id);
                invalidateAll();
                showNotification({
                    title: 'Success',
                    message: `${config.entityName} deleted successfully`,
                    color: 'green'
                });
            } catch (err: unknown) {
                const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
                showNotification({
                    title: 'Error',
                    message: errorObj?.response?.data?.detail || errorObj?.message || `Failed to delete ${config.entityName.toLowerCase()}.`,
                    color: 'red'
                });
                throw err;
            }
        },
        mergeEntities: async (sourceIds, targetId) => {
            try {
                await config.onMerge(sourceIds, targetId);
                invalidateAll();
                showNotification({
                    title: 'Success',
                    message: `${config.entityNamePlural} merged successfully`,
                    color: 'green'
                });
            } catch (err: unknown) {
                const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
                showNotification({
                    title: 'Error',
                    message: errorObj?.response?.data?.detail || errorObj?.message || `Failed to merge ${config.entityNamePlural.toLowerCase()}.`,
                    color: 'red'
                });
                throw err;
            }
        },
        bulkDeleteEntities: async (ids) => {
            try {
                await config.onBulkDelete(ids);
                invalidateAll();
                showNotification({
                    title: 'Success',
                    message: `${ids.length} ${config.entityNamePlural.toLowerCase()} deleted successfully`,
                    color: 'green'
                });
            } catch (err: unknown) {
                const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
                showNotification({
                    title: 'Error',
                    message: errorObj?.response?.data?.detail || errorObj?.message || `Failed to delete selected ${config.entityNamePlural.toLowerCase()}.`,
                    color: 'red'
                });
                throw err;
            }
        },
        deleteTitle: `Delete ${config.entityName}`,
        deleteMessage: config.deleteMessage || `Are you sure you want to delete this ${config.entityName.toLowerCase()}?`
    });

    const { setSelectedIds } = crud;
    useEffect(() => {
        setSelectedIds(new Set());
    }, [page, search, setSelectedIds]);

    const isFormDirty = useMemo(() => {
        if (editingId) {
            const original = items.find(item => item.id === editingId) || null;
            const originalName = original?.name || '';
            const nameChanged = name !== originalName;
            const extraChanged = config.isExtraDirty ? config.isExtraDirty(original, extraState) : false;
            return nameChanged || extraChanged;
        }
        const nameProvided = name.trim() !== '';
        const extraProvided = config.isExtraDirty ? config.isExtraDirty(null, extraState) : false;
        return nameProvided || extraProvided;
    }, [editingId, name, extraState, items, config]);

    const resetModalState = () => {
        setName('');
        setExtraState(config.getInitialExtraState ? config.getInitialExtraState(null) : ({} as TExtra));
        setError(null);
        setEditingId(null);
        setModalOpen(false);
    };

    const handleClose = () => {
        if (isFormDirty) {
            modals.openConfirmModal({
                title: 'Unsaved Changes',
                centered: true,
                children: <Text size="sm">You have unsaved changes. Do you want to discard them?</Text>,
                labels: { confirm: 'Discard Changes', cancel: 'Keep Editing' },
                confirmProps: { color: 'red' },
                onConfirm: resetModalState
            });
        } else {
            resetModalState();
        }
    };

    const handleOpenCreate = () => {
        setEditingId(null);
        setName('');
        setExtraState(config.getInitialExtraState ? config.getInitialExtraState(null) : ({} as TExtra));
        setError(null);
        setModalOpen(true);
    };

    const handleOpenEdit = (item: T) => {
        setEditingId(item.id);
        setName(item.name);
        setExtraState(config.getInitialExtraState ? config.getInitialExtraState(item) : ({} as TExtra));
        setError(null);
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!name.trim()) return;
        setError(null);
        setIsSubmitting(true);

        try {
            if (editingId) {
                await config.onUpdate(editingId, name.trim(), extraState);
                invalidateAll();
                showNotification({
                    title: 'Success',
                    message: `${config.entityName} updated successfully`,
                    color: 'green'
                });
            } else if (config.onCreate) {
                await config.onCreate(name.trim(), extraState);
                invalidateAll();
                showNotification({
                    title: 'Success',
                    message: `${config.entityName} created successfully`,
                    color: 'green'
                });
            }
            resetModalState();
        } catch (err: unknown) {
            const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
            const errorMsg = errorObj?.response?.data?.detail || errorObj?.message || `Failed to save ${config.entityName.toLowerCase()}.`;
            setError(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <Text>Loading...</Text>;

    const selectedItems = items.filter(item => crud.selectedIds.has(item.id));
    const canCreate = config.allowCreate !== false && Boolean(config.onCreate);
    const colSpan = 5 + (config.extraColumnsCount ?? 0);
    const isPending = isSubmitting || config.isSaving;

    const currentEditingItem = editingId ? items.find(i => i.id === editingId) || null : null;

    return (
        <Stack>
            {config.infoBanner && (
                <Box mb="md">
                    {config.infoBanner}
                </Box>
            )}

            <TaxonomyTable
                searchPlaceholder={config.searchPlaceholder || `Search ${config.entityNamePlural.toLowerCase()}...`}
                search={search}
                onSearchChange={setSearch}
                selectedCount={crud.selectedIds.size}
                onMergeClick={() => { crud.setTargetId(null); crud.setMergeModalOpen(true); }}
                onBulkDeleteClick={crud.handleBulkDelete}
                onAddClick={canCreate ? handleOpenCreate : undefined}
                addLabel={`Add ${config.entityName}`}
                isAllSelected={crud.isAllSelected}
                isIndeterminate={crud.isIndeterminate}
                onSelectAll={crud.handleSelectAll}
                showingCount={items.length}
                totalCount={totalItems}
                entityNamePlural={config.entityNamePlural.toLowerCase()}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                headerCells={
                    <>
                        <SortableHeader label="Name" sortKey="name" currentSortBy={sortBy} onSort={setSortBy} />
                        {config.extraHeaderCells?.({ sortBy, setSortBy })}
                        <SortableHeader label="Sets" sortKey="set_count" currentSortBy={sortBy} onSort={setSortBy} w={100} />
                        <SortableHeader label="Images" sortKey="image_count" currentSortBy={sortBy} onSort={setSortBy} w={100} />
                        <Table.Th w={100}>Actions</Table.Th>
                    </>
                }
            >
                {items.map(item => (
                    <Table.Tr key={item.id}>
                        <Table.Td>
                            <Checkbox 
                                checked={crud.selectedIds.has(item.id)}
                                onChange={() => crud.toggleSelect(item.id)}
                            />
                        </Table.Td>
                        <Table.Td>
                            <Text 
                                style={{ cursor: 'pointer', display: 'inline-block' }} 
                                c="blue" 
                                fw={500}
                                onClick={() => navigate(config.getFilterUrl(item))}
                            >
                                {item.name}
                            </Text>
                        </Table.Td>
                        {config.renderExtraCells?.(item)}
                        <Table.Td>
                            <Badge color="gray" variant="light">{item.set_count ?? 0}</Badge>
                        </Table.Td>
                        <Table.Td>
                            <Badge color="blue" variant="light">{item.image_count ?? 0}</Badge>
                        </Table.Td>
                        <Table.Td>
                            <Group gap="xs">
                                <Tooltip label={`Edit ${config.entityName}`}>
                                    <ActionIcon variant="subtle" color="blue" onClick={() => handleOpenEdit(item)}>
                                        <IconEdit size={16} />
                                    </ActionIcon>
                                </Tooltip>
                                <ActionIcon variant="subtle" color="red" onClick={() => crud.handleDelete(item.id)}>
                                    <IconTrash size={16} />
                                </ActionIcon>
                            </Group>
                        </Table.Td>
                    </Table.Tr>
                ))}
                {!items.length && (
                    <Table.Tr>
                        <Table.Td colSpan={colSpan} ta="center">
                            No {config.entityNamePlural.toLowerCase()} found.
                        </Table.Td>
                    </Table.Tr>
                )}
            </TaxonomyTable>

            <Modal 
                opened={modalOpen} 
                onClose={handleClose} 
                title={editingId ? `Edit ${config.entityName}` : `Add ${config.entityName}`}
                closeOnClickOutside={!isPending}
                closeOnEscape={!isPending}
            >
                <Stack>
                    {error && (
                        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
                            {error}
                        </Alert>
                    )}
                    {config.renderEditFields ? (
                        config.renderEditFields({
                            item: currentEditingItem,
                            name,
                            setName,
                            extraState,
                            setExtraState
                        })
                    ) : (
                        <TextInput 
                            label="Name" 
                            value={name} 
                            onChange={(e) => setName(e.currentTarget.value)} 
                            required 
                        />
                    )}
                    <Button onClick={handleSave} disabled={!name.trim() || isPending} loading={isPending}>
                        Save
                    </Button>
                </Stack>
            </Modal>

            <Modal 
                opened={crud.mergeModalOpen} 
                onClose={() => { crud.setTargetId(null); crud.setMergeModalOpen(false); }} 
                title={`Merge ${config.entityNamePlural}`}
            >
                <Stack>
                    <Text size="sm">
                        Select the primary {config.entityName.toLowerCase()}. All other selected {config.entityNamePlural.toLowerCase()} will be merged into it and deleted.
                    </Text>
                    <Select
                        label="Primary Target"
                        data={selectedItems.map(item => ({ 
                            value: String(item.id), 
                            label: config.getMergeOptionLabel 
                                ? config.getMergeOptionLabel(item) 
                                : `${item.name} — ${item.set_count ?? 0} sets [#${item.id}]` 
                        }))}
                        value={crud.targetId}
                        onChange={crud.setTargetId}
                        required
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => { crud.setTargetId(null); crud.setMergeModalOpen(false); }}>Cancel</Button>
                        <Button color="grape" onClick={crud.handleMerge} disabled={!crud.targetId}>
                            Confirm Merge
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
