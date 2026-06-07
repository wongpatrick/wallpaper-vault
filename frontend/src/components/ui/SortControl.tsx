/**
 * @file
 * Module: Sort Control
 * Description: UI component for selecting sort field and direction.
 */
import { Group, Select, ActionIcon, Tooltip } from '@mantine/core';
import { IconSortAscending, IconSortDescending } from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';

interface SortOption {
    label: string;
    value: string;
}

interface SortControlProps {
    options: SortOption[];
    defaultSortBy: string;
    defaultSortDir?: 'asc' | 'desc';
}

export function SortControl({ options, defaultSortBy, defaultSortDir = 'desc' }: SortControlProps) {
    const [searchParams, setSearchParams] = useSearchParams();

    const sortBy = searchParams.get('sort_by') || defaultSortBy;
    const sortDir = searchParams.get('sort_dir') || defaultSortDir;

    const handleSortByChange = (val: string | null) => {
        if (!val) return;
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('sort_by', val);
            next.delete('page'); // Reset to page 1
            return next;
        }, { replace: true });
    };

    const toggleSortDir = () => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('sort_dir', sortDir === 'asc' ? 'desc' : 'asc');
            next.delete('page'); // Reset to page 1
            return next;
        }, { replace: true });
    };

    return (
        <Group gap="xs" align="flex-end">
            <Select
                label="Sort by"
                data={options}
                value={sortBy}
                onChange={handleSortByChange}
                allowDeselect={false}
                style={{ width: 160 }}
            />
            <Tooltip label={sortDir === 'asc' ? "Ascending" : "Descending"}>
                <ActionIcon 
                    variant="default" 
                    size="36px"
                    onClick={toggleSortDir}
                >
                    {sortDir === 'asc' ? <IconSortAscending size={20} /> : <IconSortDescending size={20} />}
                </ActionIcon>
            </Tooltip>
        </Group>
    );
}
