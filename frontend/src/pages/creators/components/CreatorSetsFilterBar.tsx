/**
 * @file
 * Module: Creator Sets Filter Bar
 * Description: Renders search, orientation segmented control, and sort selector for creator sets.
 */
import { Group, TextInput, Input, SegmentedControl, Select } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';

export interface CreatorSetsFilterBarProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    orientationFilter: string;
    onOrientationChange: (value: string) => void;
    sortBy: string;
    onSortChange: (value: string) => void;
}

export function CreatorSetsFilterBar({
    searchQuery,
    onSearchChange,
    orientationFilter,
    onOrientationChange,
    sortBy,
    onSortChange
}: CreatorSetsFilterBarProps) {
    return (
        <Group mb="xl" wrap="wrap" gap="md" align="flex-end">
            <TextInput
                label="Search"
                placeholder="Search titles, tags, or characters..."
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.currentTarget.value)}
                style={{ flex: 1, minWidth: 220, maxWidth: 400 }}
            />
            <Input.Wrapper label="Orientation">
                <SegmentedControl
                    value={orientationFilter}
                    onChange={onOrientationChange}
                    data={[
                        { label: 'All', value: 'all' },
                        { label: 'Landscape', value: 'landscape' },
                        { label: 'Portrait', value: 'portrait' },
                        { label: 'Square', value: 'square' },
                    ]}
                />
            </Input.Wrapper>
            <Select
                label="Sort By"
                w={200}
                value={sortBy}
                onChange={(val) => onSortChange(val || 'date_added_desc')}
                data={[
                    { label: 'Date Added (Newest)', value: 'date_added_desc' },
                    { label: 'Date Added (Oldest)', value: 'date_added_asc' },
                    { label: 'Title (A-Z)', value: 'title_asc' },
                    { label: 'Title (Z-A)', value: 'title_desc' },
                    { label: 'Image Count (High-Low)', value: 'image_count_desc' },
                    { label: 'Image Count (Low-High)', value: 'image_count_asc' },
                    { label: 'Folder Size (Largest)', value: 'folder_size_desc' },
                    { label: 'Folder Size (Smallest)', value: 'folder_size_asc' },
                ]}
            />
        </Group>
    );
}
