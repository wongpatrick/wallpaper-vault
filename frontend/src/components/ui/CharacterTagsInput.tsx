/** @file */
import { useMemo } from 'react';
import { TagsInput } from '@mantine/core';
import type { TagsInputProps, ComboboxProps } from '@mantine/core';
import { useReadCharacters } from '../../api/taxonomy';

export type CharacterTagsInputProps = Omit<TagsInputProps, 'data'>;

export function CharacterTagsInput(props: CharacterTagsInputProps) {
    // Fetch characters for tags input (max 500 allowed by backend pagination limit).
    const { data: charData } = useReadCharacters({ skip: 0, limit: 500 });


    const characters = charData?.items;

    const data = useMemo(() => {
        if (!characters) return [];
        const mapped = characters.map(c => c.franchise ? `${c.name} (${c.franchise.name})` : c.name);
        return Array.from(new Set(mapped));
    }, [characters]);


    return (
        <TagsInput
            description="Use 'Name (Franchise)' to link a franchise, e.g., Kurumi (Date A Live)"
            {...props}
            data={data}
            clearable
            comboboxProps={{ zIndex: 4000, portalProps: { zIndex: 4000 } } as ComboboxProps}
        />
    );
}
