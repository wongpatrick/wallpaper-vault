/** @file */
import { useMemo } from 'react';
import { Select } from '@mantine/core';
import type { SelectProps, ComboboxProps } from '@mantine/core';
import { useReadCharacters } from '../../api/taxonomy';

export type CharacterAutocompleteInputProps = Omit<SelectProps, 'data'>;

export function CharacterAutocompleteInput(props: CharacterAutocompleteInputProps) {
    // Fetch characters for autocomplete (max 500 allowed by backend pagination limit).
    const { data: charData } = useReadCharacters({ skip: 0, limit: 500 });


    const characters = charData?.items;

    const data = useMemo(() => {
        if (!characters) return [];
        return Array.from(new Set(characters.map(c => c.name)));
    }, [characters]);


    return (
        <Select
            {...props}
            data={data}
            searchable
            clearable
            comboboxProps={{ zIndex: 4000, portalProps: { zIndex: 4000 } } as ComboboxProps}
        />
    );
}
