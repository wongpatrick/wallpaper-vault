/** @file */
import { TaxonomyAutocompleteInput, type TaxonomyAutocompleteInputProps } from './TaxonomyAutocompleteInput';
import type { SelectProps } from '@mantine/core';

export type FranchiseAutocompleteInputProps = Omit<SelectProps, 'data'>;

export function FranchiseAutocompleteInput(props: FranchiseAutocompleteInputProps) {
    return <TaxonomyAutocompleteInput {...props} taxonomyType="franchise" />;
}

export type { TaxonomyAutocompleteInputProps };
