/**
 * @file Generic reusable table component for taxonomy pages.
 */
/* eslint-disable no-magic-numbers */
import type { ReactNode } from 'react';
import {
    Table, Checkbox, Group, Text, TextInput, Button, Pagination, Stack
} from '@mantine/core';
import {
    IconSearch, IconPlus, IconSortAscending, IconSortDescending, IconArrowsSort
} from '@tabler/icons-react';

export function SortableHeader({
    label,
    sortKey,
    currentSortBy,
    onSort,
    w
}: {
    label: string;
    sortKey: string;
    currentSortBy: string | null;
    onSort: (val: string) => void;
    w?: number;
}) {
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

interface TaxonomyTableProps {
    searchPlaceholder: string;
    search: string;
    onSearchChange: (val: string) => void;
    selectedCount: number;
    onMergeClick?: () => void;
    onBulkDeleteClick?: () => void;
    onAddClick?: () => void;
    addLabel?: string;
    isAllSelected: boolean;
    isIndeterminate: boolean;
    onSelectAll: (checked: boolean) => void;
    headerCells: ReactNode;
    children: ReactNode;
    showingCount: number;
    totalCount: number;
    entityNamePlural: string;
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export function TaxonomyTable({
    searchPlaceholder,
    search,
    onSearchChange,
    selectedCount,
    onMergeClick,
    onBulkDeleteClick,
    onAddClick,
    addLabel,
    isAllSelected,
    isIndeterminate,
    onSelectAll,
    headerCells,
    children,
    showingCount,
    totalCount,
    entityNamePlural,
    page,
    totalPages,
    onPageChange
}: TaxonomyTableProps) {
    return (
        <Stack>
            <Group justify="space-between" align="center" style={{ flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)' }}>
                <Group style={{ flex: 1, flexWrap: 'wrap' }}>
                    <TextInput 
                        placeholder={searchPlaceholder}
                        leftSection={<IconSearch size={16} />}
                        value={search}
                        onChange={(e) => onSearchChange(e.currentTarget.value)}
                        style={{ width: 250 }}
                    />
                    {selectedCount >= 2 && onMergeClick && (
                        <Button color="grape" onClick={onMergeClick}>
                            Merge Selected ({selectedCount})
                        </Button>
                    )}
                    {selectedCount >= 1 && onBulkDeleteClick && (
                        <Button color="red" onClick={onBulkDeleteClick}>
                            Delete Selected ({selectedCount})
                        </Button>
                    )}
                </Group>
                {onAddClick && addLabel && (
                    <Button leftSection={<IconPlus size={16} />} onClick={onAddClick}>
                        {addLabel}
                    </Button>
                )}
            </Group>

            <Table.ScrollContainer minWidth={500}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th w={40}>
                                <Checkbox 
                                    checked={isAllSelected}
                                    indeterminate={isIndeterminate}
                                    onChange={(e) => onSelectAll(e.currentTarget.checked)}
                                />
                            </Table.Th>
                            {headerCells}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {children}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>

            <Group justify="space-between" mt="md">
                <Text size="sm" c="dimmed">Showing {showingCount} of {totalCount} {entityNamePlural}</Text>
                {totalPages > 1 && (
                    <Pagination total={totalPages} value={page} onChange={onPageChange} />
                )}
            </Group>
        </Stack>
    );
}
