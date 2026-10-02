/**
 * @file
 * Module: Edit Set Modal Component
 * Description: Standalone modal for editing set metadata, local paths, tags, and creator assignments.
 */
import { useState, useMemo } from 'react';
import { Modal, Stack, TextInput, Textarea, Group, Button, Switch, TagsInput } from '@mantine/core';
import { IconLock, IconLockOpen } from '@tabler/icons-react';
import { TagAutocompleteInput } from '../../../components/ui/TagAutocompleteInput';
import { CharacterTagsInput } from '../../../components/ui/CharacterTagsInput';
import { useQueryClient } from '@tanstack/react-query';
import { useReadCreatorsApiCreatorsGet, useCreateCreatorApiCreatorsPost } from '../../../api/generated/creators/creators';
import { useUpdateSetApiSetsSetIdPatch, getReadSetsApiSetsGetQueryKey } from '../../../api/generated/sets/sets';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import type { Set as SetModel, SetUpdate } from '../../../api/model';

interface EditSetFormProps {
    set: SetModel;
    onClose: () => void;
    onSuccess: () => void;
}

function EditSetForm({ set, onClose, onSuccess }: EditSetFormProps) {
    const queryClient = useQueryClient();
    const { showNotification } = useAppNotifications();
    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 });
    const updateMutation = useUpdateSetApiSetsSetIdPatch();
    const createCreatorMutation = useCreateCreatorApiCreatorsPost();

    const [enablePathEdit, setEnablePathEdit] = useState(false);
    const [editForm, setEditForm] = useState(() => ({
        title: set.title || '',
        notes: set.notes || '',
        source_url: set.source_url || '',
        local_path: set.local_path || '',
        creator_names: set.creators?.map(c => c.canonical_name) || [],
        tags: Array.from(new Set(set.tags || [])),
        characters: Array.from(new Set(set.characters || []))
    }));

    const creatorOptions = useMemo(() => {
        const uniqueNames = new Set(creatorsData?.items?.map(c => c.canonical_name) || []);
        return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b));
    }, [creatorsData]);

    const handleUpdate = async () => {
        try {
            const { local_path, creator_names, ...otherFields } = editForm;

            // Resolve or create creators in parallel
            const creatorIdPromises = creator_names.map(async (name) => {
                const trimmedName = name.trim();
                if (!trimmedName) return null;

                const existing = creatorsData?.items?.find(
                    c => c.canonical_name.toLowerCase() === trimmedName.toLowerCase()
                );

                if (existing) {
                    return existing.id;
                }

                const newCreator = await createCreatorMutation.mutateAsync({
                    data: { canonical_name: trimmedName }
                });
                return newCreator.id;
            });

            const resolvedCreatorIds = await Promise.all(creatorIdPromises);
            const finalCreatorIds = resolvedCreatorIds.filter((id): id is number => id !== null);

            const updateData: SetUpdate = {
                title: otherFields.title,
                notes: otherFields.notes || undefined,
                source_url: otherFields.source_url || undefined,
                creator_ids: finalCreatorIds,
                tags: editForm.tags,
                characters: editForm.characters
            };

            if (enablePathEdit) {
                updateData.local_path = local_path;
            }

            await updateMutation.mutateAsync({
                setId: set.id,
                data: updateData
            });

            showNotification({ title: 'Success', message: 'Set metadata updated', color: 'green' });
            queryClient.invalidateQueries({ queryKey: getReadSetsApiSetsGetQueryKey() });
            onClose();
            onSuccess();
        } catch {
            showNotification({ title: 'Error', message: 'Could not update set', color: 'red' });
        }
    };

    return (
        <Stack gap="md">
            <TextInput 
                label="Set Title" 
                value={editForm.title} 
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                required
            />
            
            <TagsInput 
                label="Creators / Authors"
                placeholder="Type creator name and press Enter"
                data={creatorOptions}
                value={editForm.creator_names}
                onChange={(val) => setEditForm({ ...editForm, creator_names: val })}
                description="Add one or more creators who produced this wallpaper set."
            />

            <TextInput 
                label="Source URL" 
                placeholder="https://..."
                value={editForm.source_url} 
                onChange={(e) => setEditForm({ ...editForm, source_url: e.target.value })}
            />

            <Textarea 
                label="Notes" 
                placeholder="Additional notes about this set..."
                value={editForm.notes} 
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={3}
            />

            <CharacterTagsInput 
                value={editForm.characters}
                onChange={(val) => setEditForm({ ...editForm, characters: val })}
            />

            <TagAutocompleteInput 
                label="Tags"
                value={editForm.tags}
                onChange={(val) => setEditForm({ ...editForm, tags: val })}
            />

            <Switch 
                label="Enable local folder path editing" 
                checked={enablePathEdit} 
                onChange={(e) => setEnablePathEdit(e.currentTarget.checked)} 
                thumbIcon={
                    enablePathEdit ? (
                        <IconLockOpen size="0.8rem" color="var(--mantine-color-blue-6)" />
                    ) : (
                        <IconLock size="0.8rem" color="var(--mantine-color-gray-6)" />
                    )
                }
            />

            {enablePathEdit && (
                <TextInput 
                    label="Local Path" 
                    value={editForm.local_path} 
                    onChange={(e) => setEditForm({ ...editForm, local_path: e.target.value })}
                    description="Warning: Changing local path without moving the actual folder on disk might cause missing files."
                />
            )}

            <Group justify="flex-end" mt="md">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleUpdate} loading={updateMutation.isPending}>Save Changes</Button>
            </Group>
        </Stack>
    );
}

export interface EditSetModalProps {
    opened: boolean;
    onClose: () => void;
    set: SetModel;
    onSuccess: () => void;
}

export function EditSetModal({ opened, onClose, set, onSuccess }: EditSetModalProps) {
    return (
        <Modal 
            opened={opened} 
            onClose={onClose} 
            title="Edit Set Details"
            size="lg"
        >
            {opened && (
                <EditSetForm 
                    key={set.id}
                    set={set} 
                    onClose={onClose} 
                    onSuccess={onSuccess} 
                />
            )}
        </Modal>
    );
}
