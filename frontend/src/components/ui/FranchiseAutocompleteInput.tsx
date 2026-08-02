/** @file */
import { useMemo } from 'react';
import { Select } from '@mantine/core';
import type { SelectProps, ComboboxProps } from '@mantine/core';
import { useReadFranchises } from '../../api/taxonomy';

export type FranchiseAutocompleteInputProps = Omit<SelectProps, 'data'>;

export function FranchiseAutocompleteInput(props: FranchiseAutocompleteInputProps) {
    // Fetch franchises for autocomplete.
    const { data: franchiseData } = useReadFranchises({ skip: 0, limit: 500 });

    const franchises = franchiseData?.items;

    const data = useMemo(() => {
        if (!franchises) return [];
        return Array.from(new Set(franchises.map(f => f.name)));
    }, [franchises]);


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
