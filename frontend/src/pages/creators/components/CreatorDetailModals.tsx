/**
 * @file
 * Module: Creator Detail Modals Component
 * Description: Mounts edit, merge, delete, and create-set dialog modals for CreatorDetail.
 */
import { useQueryClient } from '@tanstack/react-query';
import { getReadSetsApiSetsGetQueryKey } from '../../../api/generated/sets/sets';
import { CreatorEditModal } from '../CreatorEditModal';
import { CreatorMergeModal } from './CreatorMergeModal';
import { CreatorDeleteModal } from './CreatorDeleteModal';
import { CreateSetModal } from '../../../components/sets/CreateSetModal';
import type { CreatorWithSets } from '../../../api/model';
import type { useCreatorMutations } from '../hooks/useCreatorMutations';

export interface CreatorDetailModalsProps {
    creator: CreatorWithSets;
    mutations: ReturnType<typeof useCreatorMutations>;
    createModalOpened: boolean;
    setCreateModalOpened: (opened: boolean) => void;
    refetch: () => void;
}

export function CreatorDetailModals({
    creator,
    mutations,
    createModalOpened,
    setCreateModalOpened,
    refetch
}: CreatorDetailModalsProps) {
    const queryClient = useQueryClient();

    return (
        <>
            {/* Edit Modal */}
            <CreatorEditModal 
                opened={mutations.isEditModalOpen} 
                onClose={() => mutations.setIsEditModalOpen(false)} 
                initialData={{
                    canonical_name: creator.canonical_name,
                    type: creator.type || 'Creator',
                    notes: creator.notes || '',
                    socials: creator.socials ? [...creator.socials] : []
                }}
                onSave={mutations.handleUpdate}
                loading={mutations.updateMutation.isPending}
            />

            {/* Merge Confirmation Modal */}
            <CreatorMergeModal 
                opened={mutations.mergePrompt.show}
                onClose={() => mutations.setMergePrompt({ show: false, targetId: null })}
                conflictingName={mutations.mergePrompt.conflictingName}
                creatorName={creator.canonical_name}
                onConfirm={mutations.handleMergeConfirm}
            />

            {/* Delete Confirmation Modal */}
            <CreatorDeleteModal 
                opened={mutations.isDeleteModalOpen}
                onClose={() => mutations.setIsDeleteModalOpen(false)}
                onConfirm={mutations.confirmDelete}
                loading={mutations.deleteMutation.isPending}
            />

            {/* Create Set Modal */}
            <CreateSetModal 
                opened={createModalOpened}
                onClose={() => setCreateModalOpened(false)}
                onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: getReadSetsApiSetsGetQueryKey() });
                    refetch();
                }}
                initialCreatorNames={[creator.canonical_name]}
            />
        </>
    );
}
