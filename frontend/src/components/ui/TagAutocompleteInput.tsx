import { useState } from 'react';
import { TagsInput } from '@mantine/core';
import type { TagsInputProps } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useSearchTagsApiTagsGet } from '../../api/generated/tags/tags';

export interface TagAutocompleteInputProps extends Omit<TagsInputProps, 'data' | 'searchValue' | 'onSearchChange'> {
    // Custom wrapper for tags input that auto-fetches autocomplete tags
}

export function TagAutocompleteInput(props: TagAutocompleteInputProps) {
    const [searchValue, setSearchValue] = useState('');
    const [debouncedSearch] = useDebouncedValue(searchValue, 300);

    // Fetch tags matching the search value, only if there is a search term
    const { data: suggestions } = useSearchTagsApiTagsGet(
        { q: debouncedSearch, limit: 50 },
        { query: { enabled: debouncedSearch.length > 0 } }
    );

    return (
        <TagsInput
            {...props}
            data={searchValue.length > 0 ? (suggestions || []) : []}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            splitChars={[',', ' ']}
            clearable
            comboboxProps={{ zIndex: 4000, portalProps: { zIndex: 4000 } } as any}
        />
    );
}
