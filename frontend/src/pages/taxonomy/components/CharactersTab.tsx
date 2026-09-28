/**
 * @file Characters tab component for taxonomy management.
 */
import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Text, TextInput, Autocomplete } from '@mantine/core';
import type { Character } from '../../../api/model';
import {
    useReadCharactersApiCharactersGet,
    useCreateCharacterApiCharactersPost,
    useUpdateCharacterApiCharactersCharacterIdPatch,
    useDeleteCharacterApiCharactersCharacterIdDelete,
    useMergeCharactersApiCharactersMergePost,
    useBulkDeleteCharactersApiCharactersBulkDeletePost,
    getReadCharactersApiCharactersGetQueryKey
} from '../../../api/generated/characters/characters';
import {
    useReadFranchisesApiFranchisesGet,
    useCreateFranchiseApiFranchisesPost,
    getReadFranchisesApiFranchisesGetQueryKey
} from '../../../api/generated/franchises/franchises';
import { getReadSetsApiSetsGetQueryKey } from '../../../api/generated/sets/sets';
import { getReadImagesApiImagesGetQueryKey } from '../../../api/generated/images/images';
import { GenericTaxonomyTab, type TaxonomyConfig } from './GenericTaxonomyTab';
import { SortableHeader } from './TaxonomyTable';

interface CharacterExtraState {
    franchiseQuery: string;
}

export function CharactersTab() {
    const navigate = useNavigate();

    const { data: franchisesData } = useReadFranchisesApiFranchisesGet({ limit: 500 });
    const franchises = useMemo(() => franchisesData?.items || [], [franchisesData?.items]);
    const franchiseOptions = useMemo(() => Array.from(new Set(franchises.map(f => f.name))), [franchises]);

    const createMutation = useCreateCharacterApiCharactersPost();
    const updateMutation = useUpdateCharacterApiCharactersCharacterIdPatch();
    const deleteMutation = useDeleteCharacterApiCharactersCharacterIdDelete();
    const mergeMutation = useMergeCharactersApiCharactersMergePost();
    const bulkDeleteMutation = useBulkDeleteCharactersApiCharactersBulkDeletePost();
    const createFranchiseMutation = useCreateFranchiseApiFranchisesPost();

    const resolveFranchiseId = useCallback(async (query: string): Promise<number | null> => {
        const trimmed = query.trim();
        if (!trimmed) return null;

        const existing = franchises.find(f => f.name.toLowerCase() === trimmed.toLowerCase());
        if (existing) {
            return existing.id;
        }

        const newF = await createFranchiseMutation.mutateAsync({ data: { name: trimmed } });
        return newF.id;
    }, [franchises, createFranchiseMutation]);

    const config: TaxonomyConfig<Character, CharacterExtraState> = useMemo(() => ({
        entityName: 'Character',
        entityNamePlural: 'Characters',
        deleteMessage: 'Are you sure you want to delete this character? It will be removed from all associated sets.',
        mainQueryKey: getReadCharactersApiCharactersGetQueryKey(),
        additionalInvalidateKeys: [
            getReadFranchisesApiFranchisesGetQueryKey(),
            getReadSetsApiSetsGetQueryKey(),
            getReadImagesApiImagesGetQueryKey()
        ],
        useRead: useReadCharactersApiCharactersGet,
        onCreate: async (name, extraState) => {
            const franchiseId = await resolveFranchiseId(extraState.franchiseQuery);
            return createMutation.mutateAsync({ data: { name, franchise_id: franchiseId } });
        },
        onUpdate: async (id, name, extraState) => {
            const franchiseId = await resolveFranchiseId(extraState.franchiseQuery);
            return updateMutation.mutateAsync({
                characterId: id,
                data: { name, franchise_id: franchiseId }
            });
        },
        onDelete: (id) => deleteMutation.mutateAsync({ characterId: id }),
        onMerge: (sourceIds, targetId) => mergeMutation.mutateAsync({ data: { source_ids: sourceIds, target_id: targetId } }),
        onBulkDelete: (ids) => bulkDeleteMutation.mutateAsync({ data: { ids } }),
        getFilterUrl: (item) => `/images?character=${encodeURIComponent(item.name)}`,
        extraColumnsCount: 1,
        extraHeaderCells: ({ sortBy, setSortBy }) => (
            <SortableHeader label="Franchise" sortKey="franchise" currentSortBy={sortBy} onSort={setSortBy} />
        ),
        renderExtraCells: (char) => (
            <Table.Td key="franchise">
                {char.franchise ? (
                    <Text 
                        style={{ cursor: 'pointer', display: 'inline-block' }} 
                        c="blue" 
                        fw={500}
                        onClick={() => navigate(`/images?franchise=${encodeURIComponent(char.franchise!.name)}`)}
                    >
                        {char.franchise.name}
                    </Text>
                ) : (
                    <Text c="dimmed" size="sm">None</Text>
                )}
            </Table.Td>
        ),
        getInitialExtraState: (item) => ({
            franchiseQuery: item?.franchise?.name || ''
        }),
        isExtraDirty: (original, extraState) => {
            const orig = original?.franchise?.name || '';
            return extraState.franchiseQuery.trim() !== orig;
        },
        renderEditFields: ({ name, setName, extraState, setExtraState }) => (
            <>
                <TextInput
                    label="Name"
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    required
                />
                <Autocomplete
                    label="Franchise"
                    placeholder="Search or create franchise..."
                    data={franchiseOptions}
                    value={extraState.franchiseQuery}
                    onChange={(val) => setExtraState({ franchiseQuery: val })}
                    description="If you type a new name, it will be created automatically."
                />
            </>
        ),
        getMergeOptionLabel: (c) => (
            `${c.name}${c.franchise ? ` (${c.franchise.name})` : ''} — ${c.set_count ?? 0} sets [#${c.id}]`
        ),
        isSaving: createMutation.isPending || updateMutation.isPending || createFranchiseMutation.isPending
    }), [
        franchiseOptions,
        createMutation,
        updateMutation,
        deleteMutation,
        mergeMutation,
        bulkDeleteMutation,
        createFranchiseMutation,
        resolveFranchiseId,
        navigate
    ]);

    return <GenericTaxonomyTab config={config} />;
}
