/**
 * @file
 * Module: Gallery Filter Bar Component
 * Description: Presentational controls for searching, filtering, and sorting individual wallpapers.
 */
import React from 'react';
import { Group, Stack, Text, TextInput, Badge, ActionIcon, SegmentedControl } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { CharacterAutocompleteInput } from '../ui/CharacterAutocompleteInput';
import { FranchiseAutocompleteInput } from '../ui/FranchiseAutocompleteInput';
import { SortControl } from '../ui/SortControl';

export interface GalleryFilterBarProps {
    localSearch: string;
    onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    tagFilter?: string;
    onClearTag: () => void;
    characterFilter: string | null;
    onCharacterChange: (val: string | null) => void;
    franchiseFilter: string | null;
    onFranchiseChange: (val: string | null) => void;
    ratingFilter: string;
    onRatingChange: (val: string) => void;
}

export const GalleryFilterBar: React.FC<GalleryFilterBarProps> = ({
    localSearch,
    onSearchChange,
    tagFilter,
    onClearTag,
    characterFilter,
    onCharacterChange,
    franchiseFilter,
    onFranchiseChange,
    ratingFilter,
    onRatingChange,
}) => {
    return (
        <Group align="flex-end" style={{ flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)' }}>
            <Stack gap={4} style={{ flex: 1, minWidth: 220, maxWidth: 400 }}>
                <Text size="xs" fw={700} c="dimmed" ml={4}>Search</Text>
                <TextInput
                    placeholder="Search by filename, set, tags, or artist..."
                    radius="md"
                    leftSection={<IconSearch size={16} />}
                    value={localSearch}
                    onChange={onSearchChange}
                />
            </Stack>
            {tagFilter && (
                <Stack gap={4}>
                    <Text size="xs" fw={700} c="dimmed" ml={4}>Active Tag</Text>
                    <Badge
                        size="lg"
                        radius="md"
                        variant="light"
                        color="violet"
                        style={{ height: 36, textTransform: 'none', fontSize: 14 }}
                        rightSection={
                            <ActionIcon
                                size="sm"
                                color="violet"
                                radius="md"
                                variant="transparent"
                                onClick={onClearTag}
                                aria-label="Clear tag filter"
                            >
                                <IconX size={14} />
                            </ActionIcon>
                        }
                    >
                        #{tagFilter}
                    </Badge>
                </Stack>
            )}
            <Stack gap={4} w={180}>
                <Text size="xs" fw={700} c="dimmed" ml={4}>Filter by Character</Text>
                <CharacterAutocompleteInput
                    placeholder="Character"
                    value={characterFilter}
                    onChange={onCharacterChange}
                    radius="md"
                />
            </Stack>
            <Stack gap={4} w={180}>
                <Text size="xs" fw={700} c="dimmed" ml={4}>Filter by Franchise</Text>
                <FranchiseAutocompleteInput
                    placeholder="Franchise"
                    value={franchiseFilter}
                    onChange={onFranchiseChange}
                    radius="md"
                />
            </Stack>

            <Stack gap={4}>
                <Text size="xs" fw={700} c="dimmed" ml={4}>Filter by Rating</Text>
                <SegmentedControl
                    value={ratingFilter}
                    onChange={onRatingChange}
                    radius="md"
                    size="sm"
                    style={{ height: 36 }}
                    data={[
                        { label: 'All', value: 'all' },
                        { label: 'Safe', value: 'safe' },
                        { label: 'Questionable', value: 'questionable' },
                        { label: 'Explicit', value: 'explicit' },
                    ]}
                />
            </Stack>
            <SortControl 
                options={[
                    { label: 'Date Added', value: 'date_added' },
                    { label: 'File Size', value: 'file_size' },
                    { label: 'Resolution', value: 'resolution' },
                    { label: 'Rating', value: 'rating' },
                    { label: 'Aspect Ratio', value: 'aspect_ratio' },
                    { label: 'Random', value: 'random' },
                ]} 
                defaultSortBy="date_added" 
            />
        </Group>
    );
};
