/** @file */
import { useMemo } from 'react';
import { Select } from '@mantine/core';
import type { SelectProps, ComboboxProps } from '@mantine/core';
import { useReadCharacters } from '../../api/taxonomy';

export type CharacterAutocompleteInputProps = Omit<SelectProps, 'data'>;

export function CharacterAutocompleteInput(props: CharacterAutocompleteInputProps) {
    // Fetch all characters. In a real large app, this might need a dedicated search endpoint.
    // eslint-disable-next-line no-magic-numbers
    const { data: characters } = useReadCharacters(0, 1000);

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
