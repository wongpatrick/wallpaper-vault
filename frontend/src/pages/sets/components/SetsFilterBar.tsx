/**
 * @file
 * Module: Sets Filter Bar
 * Description: Search, character, franchise, creator type, sort, and list/grid layout toggle controls for Sets page.
 */
import { Group, Stack, Text, TextInput, Select, SegmentedControl, Center } from '@mantine/core';
import { IconSearch, IconFilter, IconList, IconLayoutGrid } from '@tabler/icons-react';
import { CharacterAutocompleteInput } from '../../../components/ui/CharacterAutocompleteInput';
import { FranchiseAutocompleteInput } from '../../../components/ui/FranchiseAutocompleteInput';
import { SortControl } from '../../../components/ui/SortControl';
import { CREATOR_TYPES } from '../../../types/enums';

export interface SetsFilterBarProps {
    localSearch: string;
    onSearchChange: (value: string) => void;
    characterFilter: string | undefined;
    onCharacterChange: (value: string | null) => void;
    franchiseFilter: string | undefined;
    onFranchiseChange: (value: string | null) => void;
    typeFilter: string | null;
    onTypeChange: (value: string | null) => void;
    view: string;
    onViewChange: (value: string) => void;
}

export function SetsFilterBar({
    localSearch,
    onSearchChange,
    characterFilter,
    onCharacterChange,
    franchiseFilter,
    onFranchiseChange,
    typeFilter,
    onTypeChange,
    view,
    onViewChange
}: SetsFilterBarProps) {
    return (
        <Group mb="xl" align="flex-end" style={{ flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)' }}>
            <Stack gap={4} style={{ flex: 1, minWidth: 220, maxWidth: 400 }}>
                <Text size="xs" fw={700} c="dimmed" ml={4}>Search</Text>
                <TextInput
                    placeholder="Search titles, tags, or creators..."
                    leftSection={<IconSearch size={16} />}
                    value={localSearch}
                    onChange={(e) => onSearchChange(e.currentTarget.value)}
                />
            </Stack>
            <Stack gap={4} w={180}>
                <Text size="xs" fw={700} c="dimmed" ml={4}>Filter by Character</Text>
                <CharacterAutocompleteInput
                    placeholder="Character"
                    value={characterFilter || null}
                    onChange={onCharacterChange}
                />
            </Stack>
            <Stack gap={4} w={180}>
                <Text size="xs" fw={700} c="dimmed" ml={4}>Filter by Franchise</Text>
                <FranchiseAutocompleteInput
                    placeholder="Franchise"
                    value={franchiseFilter || null}
                    onChange={onFranchiseChange}
                />
            </Stack>
            <Stack gap={4} w={160}>
                <Text size="xs" fw={700} c="dimmed" ml={4}>Creator type</Text>
                <Select
                    placeholder="All types"
                    leftSection={<IconFilter size={16} />}
                    data={CREATOR_TYPES as unknown as string[]}
                    clearable
                    value={typeFilter}
                    onChange={onTypeChange}
                />
            </Stack>
            <Group gap="xs">
                <SortControl 
                    options={[
                        { label: 'Date Added', value: 'date_added' },
                        { label: 'Title (A-Z)', value: 'title' },
                        { label: 'Image Count', value: 'image_count' }
                    ]}
                    defaultSortBy="date_added"
                />
                <SegmentedControl
                    value={view}
                    onChange={onViewChange}
                    data={[
                        { label: <Center><IconList size={16} /></Center>, value: 'list' },
                        { label: <Center><IconLayoutGrid size={16} /></Center>, value: 'card' },
                    ]}
                />
            </Group>
        </Group>
    );
}
