/**
 * @file
 * Module: Create Set Modal
 * Description: A modal for creating a new wallpaper set.
 */
import { useState, useMemo, useEffect } from 'react';
import { Modal, TextInput, Textarea, TagsInput, Stack, Button, Group, Select } from '@mantine/core';
import { useCreateSetApiSetsPost } from '../../api/generated/sets/sets';
import { useReadCreatorsApiCreatorsGet, useCreateCreatorApiCreatorsPost } from '../../api/generated/creators/creators';
import { useListLibraryPathsApiLibraryPathsGet } from '../../api/generated/library-paths/library-paths';
import { TagAutocompleteInput } from '../ui/TagAutocompleteInput';
import { CharacterTagsInput } from '../ui/CharacterTagsInput';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { Text } from '@mantine/core';
import type { Set } from '../../api/model';
import { useDemoGuard } from '../../hooks/useDemoGuard';

interface CreateSetModalProps {
    opened: boolean;
    onClose: () => void;
    onSuccess: (newSet: Set) => void;
    initialCreatorNames?: string[];
}

export function CreateSetModal({ opened, onClose, onSuccess, initialCreatorNames }: CreateSetModalProps) {
    const { guardAction } = useDemoGuard();
    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 });
    const { data: libraryPathsData } = useListLibraryPathsApiLibraryPathsGet();
    const createSetMutation = useCreateSetApiSetsPost();
    const createCreatorMutation = useCreateCreatorApiCreatorsPost();
    
    const [title, setTitle] = useState('');
    const [creatorNames, setCreatorNames] = useState<string[]>(initialCreatorNames || []);
    const [selectedLibraryPathId, setSelectedLibraryPathId] = useState<string | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [characters, setCharacters] = useState<string[]>([]);
    const [notes, setNotes] = useState('');

    const libraryPaths = useMemo(() => libraryPathsData?.items || [], [libraryPathsData]);

    useEffect(() => {
        if (opened) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCreatorNames(initialCreatorNames || []);
            const defaultLp = libraryPaths.find(p => p.is_default) || libraryPaths[0];
            if (defaultLp) {
                setSelectedLibraryPathId(defaultLp.id.toString());
            }
        }
    }, [opened, initialCreatorNames, libraryPaths]);

    const isFormDirty = useMemo(() => {
        const initialNames = initialCreatorNames || [];
        const namesChanged = creatorNames.length !== initialNames.length || 
            !creatorNames.every(name => initialNames.includes(name));

        return (
            title.trim() !== '' ||
            namesChanged ||
            tags.length > 0 ||
            characters.length > 0 ||
            notes.trim() !== ''
        );
    }, [title, creatorNames, tags, characters, notes, initialCreatorNames]);

    const resetForm = () => {
        setTitle('');
        setCreatorNames(initialCreatorNames || []);
        setTags([]);
        setCharacters([]);
        setNotes('');
    };

    const handleClose = () => {
        if (isFormDirty) {
            modals.openConfirmModal({
                title: 'Unsaved Changes',
                centered: true,
                children: (
                    <Text size="sm">
                        You have unsaved changes. Do you want to discard them?
                    </Text>
                ),
                labels: { confirm: 'Discard Changes', cancel: 'Keep Editing' },
                confirmProps: { color: 'red' },
                onConfirm: () => {
                    resetForm();
                    onClose();
                }
            });
        } else {
            resetForm();
            onClose();
        }
    };
    
    const creatorOptions = useMemo(() => {
        const uniqueNames = new Set(creatorsData?.items?.map(c => c.canonical_name) || []);
        return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b));
    }, [creatorsData]);

    const handleCreate = async () => {
        if (!title.trim()) {
            notifications.show({
                title: 'Required Field Missing',
                message: 'Please provide a title for the new set.',
                color: 'red'
            });
            return;
        }

        try {
            const finalCreatorIds: number[] = [];
            for (const name of creatorNames) {
                const trimmedName = name.trim();
                if (!trimmedName) continue;
                
                const existing = creatorsData?.items?.find(
                    c => c.canonical_name.toLowerCase() === trimmedName.toLowerCase()
                );
                
                if (existing) {
                    finalCreatorIds.push(existing.id);
                } else {
                    const newCreator = await createCreatorMutation.mutateAsync({
                        data: { canonical_name: trimmedName }
                    });
                    finalCreatorIds.push(newCreator.id);
                }
            }

            const newSet = await createSetMutation.mutateAsync({
                data: {
                    title: title.trim(),
                    creator_ids: finalCreatorIds,
                    tags: tags,
                    characters: characters,
                    notes: notes.trim() || undefined,
                    source_url: undefined,
                    local_path: undefined,
                    library_path_id: selectedLibraryPathId ? Number(selectedLibraryPathId) : undefined,
                    images: []
                }
            });
            
            notifications.show({
                title: 'Set Created',
                message: `Successfully created "${newSet.title}"`,
                color: 'green'
            });
            
            // Reset form
            setTitle('');
            setCreatorNames([]);
            setTags([]);
            setCharacters([]);
            setNotes('');
            
            onSuccess(newSet);
            onClose();
        } catch (error) {
            console.error('Error creating set:', error);
            const axiosError = error as { response?: { data?: { detail?: string } } };
            const detailMessage = axiosError.response?.data?.detail || 'Failed to create the new set.';
            notifications.show({
                title: 'Error',
                message: typeof detailMessage === 'string' ? detailMessage : 'Failed to create the new set.',
                color: 'red'
            });
        }
    };

    return (
        <Modal 
            opened={opened} 
            onClose={handleClose} 
            title="Create New Set"
            size="lg"
            radius="md"
        >
            <Stack gap="md">
                <TextInput 
                    label="Set Title" 
                    placeholder="E.g., Summer Collection 2024"
                    value={title} 
                    onChange={(e) => setTitle(e.currentTarget.value)}
                    required
                />

                {libraryPaths.length > 1 && (
                    <Select
                        label="Storage Location"
                        description="Select the library storage directory for this set."
                        data={libraryPaths.map(p => ({
                            value: p.id.toString(),
                            label: `${p.label || 'Default Library'} (${p.path})`
                        }))}
                        value={selectedLibraryPathId}
                        onChange={setSelectedLibraryPathId}
                        allowDeselect={false}
                    />
                )}
                
                <TagsInput
                    label="Artists / Creators"
                    placeholder="Type to create new or select existing"
                    data={creatorOptions}
                    value={creatorNames}
                    onChange={setCreatorNames}
                    clearable
                />
                
                <TagAutocompleteInput 
                    label="Tags"
                    placeholder="Add tags..."
                    value={tags}
                    onChange={setTags}
                />
                
                <CharacterTagsInput
                    label="Characters"
                    placeholder="Add characters..."
                    value={characters}
                    onChange={setCharacters}
                />
                
                <Textarea 
                    label="Notes"
                    placeholder="Personal notes about this set..."
                    value={notes}
                    onChange={(e) => setNotes(e.currentTarget.value)}
                    minRows={3}
                />
                
                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" onClick={handleClose}>Cancel</Button>
                    <Button 
                        onClick={guardAction(handleCreate)} 
                        loading={createSetMutation.isPending || createCreatorMutation.isPending}
                        disabled={!title.trim()}
                    >
                        Create Set
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
