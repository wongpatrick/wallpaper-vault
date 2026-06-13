/** @file */
import { useMemo } from 'react';
import { TagsInput } from '@mantine/core';
import type { TagsInputProps, ComboboxProps } from '@mantine/core';
import { useReadCharacters } from '../../api/taxonomy';

export type CharacterTagsInputProps = Omit<TagsInputProps, 'data'>;

export function CharacterTagsInput(props: CharacterTagsInputProps) {
    // Fetch all characters. In a real large app, this might need a dedicated search endpoint.
    // eslint-disable-next-line no-magic-numbers
    const { data: characters } = useReadCharacters(0, 1000);

    const data = useMemo(() => {
        if (!characters) return [];
        return characters.map(c => c.name);
    }, [characters]);

    return (
        <TagsInput
            {...props}
            data={data}
            clearable
            comboboxProps={{ zIndex: 4000, portalProps: { zIndex: 4000 } } as ComboboxProps}
        />
    );
}
