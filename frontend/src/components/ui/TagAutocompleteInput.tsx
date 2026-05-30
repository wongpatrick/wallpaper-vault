/** @file */
import { useState } from 'react';
import { TagsInput } from '@mantine/core';
import type { TagsInputProps, ComboboxProps } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useSearchTagsApiTagsGet } from '../../api/generated/tags/tags';

export type TagAutocompleteInputProps = Omit<TagsInputProps, 'data' | 'searchValue' | 'onSearchChange'>;

export function TagAutocompleteInput(props: TagAutocompleteInputProps) {
    const [searchValue, setSearchValue] = useState('');
    // eslint-disable-next-line no-magic-numbers
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
            comboboxProps={{ zIndex: 4000, portalProps: { zIndex: 4000 } } as ComboboxProps}
        />
    );
}
