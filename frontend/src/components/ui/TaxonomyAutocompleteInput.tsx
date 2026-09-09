/**
 * @file
 * Module: Taxonomy Autocomplete Input
 * Description: Reusable searchable combobox for taxonomy entities (characters, franchises).
 */
import { useMemo } from 'react';
import { Select } from '@mantine/core';
import type { SelectProps, ComboboxProps } from '@mantine/core';
import { useReadCharacters, useReadFranchises } from '../../api/taxonomy';

export type TaxonomyType = 'character' | 'franchise';

export interface TaxonomyAutocompleteInputProps extends Omit<SelectProps, 'data'> {
    taxonomyType: TaxonomyType;
}

export function TaxonomyAutocompleteInput({ taxonomyType, ...props }: TaxonomyAutocompleteInputProps) {
    const isChar = taxonomyType === 'character';
    const isFranchise = taxonomyType === 'franchise';

    const { data: charData } = useReadCharacters(
        { skip: 0, limit: 500 },
        { enabled: isChar }
    );
    const { data: franchiseData } = useReadFranchises(
        { skip: 0, limit: 500 },
        { enabled: isFranchise }
    );

    const items = isChar ? charData?.items : franchiseData?.items;

    const data = useMemo(() => {
        if (!items) return [];
        return Array.from(new Set(items.map((i: { name: string }) => i.name)));
    }, [items]);

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
