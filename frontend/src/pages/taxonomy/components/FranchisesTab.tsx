/**
 * @file Franchises tab component for taxonomy management.
 */
import { useMemo } from 'react';
import type { Franchise } from '../../../api/model';
import {
    useReadFranchisesApiFranchisesGet,
    useCreateFranchiseApiFranchisesPost,
    useUpdateFranchiseApiFranchisesFranchiseIdPatch,
    useDeleteFranchiseApiFranchisesFranchiseIdDelete,
    useMergeFranchisesApiFranchisesMergePost,
    useBulkDeleteFranchisesApiFranchisesBulkDeletePost,
    getReadFranchisesApiFranchisesGetQueryKey
} from '../../../api/generated/franchises/franchises';
import { getReadCharactersApiCharactersGetQueryKey } from '../../../api/generated/characters/characters';
import { getReadSetsApiSetsGetQueryKey } from '../../../api/generated/sets/sets';
import { getReadImagesApiImagesGetQueryKey } from '../../../api/generated/images/images';
import { GenericTaxonomyTab, type TaxonomyConfig } from './GenericTaxonomyTab';

export function FranchisesTab() {
    const createMutation = useCreateFranchiseApiFranchisesPost();
    const updateMutation = useUpdateFranchiseApiFranchisesFranchiseIdPatch();
    const deleteMutation = useDeleteFranchiseApiFranchisesFranchiseIdDelete();
    const mergeMutation = useMergeFranchisesApiFranchisesMergePost();
    const bulkDeleteMutation = useBulkDeleteFranchisesApiFranchisesBulkDeletePost();

    const config: TaxonomyConfig<Franchise> = useMemo(() => ({
        entityName: 'Franchise',
        entityNamePlural: 'Franchises',
        deleteMessage: 'Are you sure you want to delete this franchise? Associated characters will lose their franchise link.',
        mainQueryKey: getReadFranchisesApiFranchisesGetQueryKey(),
        additionalInvalidateKeys: [
            getReadCharactersApiCharactersGetQueryKey(),
            getReadSetsApiSetsGetQueryKey(),
            getReadImagesApiImagesGetQueryKey()
        ],
        useRead: useReadFranchisesApiFranchisesGet,
        onCreate: (name) => createMutation.mutateAsync({ data: { name } }),
        onUpdate: (id, name) => updateMutation.mutateAsync({ franchiseId: id, data: { name } }),
        onDelete: (id) => deleteMutation.mutateAsync({ franchiseId: id }),
        onMerge: (sourceIds, targetId) => mergeMutation.mutateAsync({ data: { source_ids: sourceIds, target_id: targetId } }),
        onBulkDelete: (ids) => bulkDeleteMutation.mutateAsync({ data: { ids } }),
        getFilterUrl: (item) => `/images?franchise=${encodeURIComponent(item.name)}`,
        isSaving: createMutation.isPending || updateMutation.isPending
    }), [createMutation, updateMutation, deleteMutation, mergeMutation, bulkDeleteMutation]);

    return <GenericTaxonomyTab config={config} />;
}
