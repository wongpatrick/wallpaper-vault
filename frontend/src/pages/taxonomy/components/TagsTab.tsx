/**
 * @file Tags tab component for taxonomy management.
 */
import { useMemo } from 'react';
import { Text } from '@mantine/core';
import type { Tag } from '../../../api/model';
import {
    useReadTagsManagementApiTagsManagementGet,
    useUpdateTagApiTagsTagIdPatch,
    useDeleteTagApiTagsTagIdDelete,
    useMergeTagsApiTagsMergePost,
    useBulkDeleteTagsApiTagsBulkDeletePost,
    getReadTagsManagementApiTagsManagementGetQueryKey,
    getSearchTagsApiTagsGetQueryKey,
    getReadTagCloudApiTagsCloudGetQueryKey
} from '../../../api/generated/tags/tags';
import { getReadSetsApiSetsGetQueryKey } from '../../../api/generated/sets/sets';
import { getReadImagesApiImagesGetQueryKey } from '../../../api/generated/images/images';
import { GenericTaxonomyTab, type TaxonomyConfig } from './GenericTaxonomyTab';

export function TagsTab() {
    const updateMutation = useUpdateTagApiTagsTagIdPatch();
    const deleteMutation = useDeleteTagApiTagsTagIdDelete();
    const mergeMutation = useMergeTagsApiTagsMergePost();
    const bulkDeleteMutation = useBulkDeleteTagsApiTagsBulkDeletePost();

    const config: TaxonomyConfig<Tag> = useMemo(() => ({
        entityName: 'Tag',
        entityNamePlural: 'Tags',
        allowCreate: false,
        deleteMessage: 'Are you sure you want to delete this tag? It will be removed from all sets.',
        infoBanner: (
            <Text c="dimmed">
                Tags are currently created automatically when added to images or sets. You can rename or delete them here.
            </Text>
        ),
        mainQueryKey: getReadTagsManagementApiTagsManagementGetQueryKey(),
        additionalInvalidateKeys: [
            getReadSetsApiSetsGetQueryKey(),
            getSearchTagsApiTagsGetQueryKey(),
            getReadTagCloudApiTagsCloudGetQueryKey(),
            getReadImagesApiImagesGetQueryKey()
        ],
        useRead: useReadTagsManagementApiTagsManagementGet,
        onUpdate: (id, name) => updateMutation.mutateAsync({ tagId: id, data: { name } }),
        onDelete: (id) => deleteMutation.mutateAsync({ tagId: id }),
        onMerge: (sourceIds, targetId) => mergeMutation.mutateAsync({ data: { source_ids: sourceIds, target_id: targetId } }),
        onBulkDelete: (ids) => bulkDeleteMutation.mutateAsync({ data: { ids } }),
        getFilterUrl: (item) => `/images?tag=${encodeURIComponent(item.name)}`,
        isSaving: updateMutation.isPending
    }), [updateMutation, deleteMutation, mergeMutation, bulkDeleteMutation]);

    return <GenericTaxonomyTab config={config} />;
}
