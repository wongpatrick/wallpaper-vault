/** @file */
import { TaxonomyAutocompleteInput, type TaxonomyAutocompleteInputProps } from './TaxonomyAutocompleteInput';
import type { SelectProps } from '@mantine/core';

export type CharacterAutocompleteInputProps = Omit<SelectProps, 'data'>;

export function CharacterAutocompleteInput(props: CharacterAutocompleteInputProps) {
    return <TaxonomyAutocompleteInput {...props} taxonomyType="character" />;
}

export type { TaxonomyAutocompleteInputProps };
