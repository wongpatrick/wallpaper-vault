/** @file */
import { useMemo } from 'react';
import { Select } from '@mantine/core';
import type { SelectProps, ComboboxProps } from '@mantine/core';
import { useReadFranchises } from '../../api/taxonomy';

export type FranchiseAutocompleteInputProps = Omit<SelectProps, 'data'>;

export function FranchiseAutocompleteInput(props: FranchiseAutocompleteInputProps) {
    // Fetch all franchises. In a real large app, this might need a dedicated search endpoint.
    // eslint-disable-next-line no-magic-numbers
    const { data: franchises } = useReadFranchises(0, 1000);

    const data = useMemo(() => {
        if (!franchises) return [];
        return franchises.map(f => f.name);
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
