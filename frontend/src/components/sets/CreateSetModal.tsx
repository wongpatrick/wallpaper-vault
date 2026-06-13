/**
 * @file
 * Module: Create Set Modal
 * Description: A modal for creating a new wallpaper set.
 */
import { useState, useMemo } from 'react';
import { Modal, TextInput, Textarea, TagsInput, Stack, Button, Group } from '@mantine/core';
import { useCreateSetApiSetsPost } from '../../api/generated/sets/sets';
import { useReadCreatorsApiCreatorsGet, useCreateCreatorApiCreatorsPost } from '../../api/generated/creators/creators';
import { TagAutocompleteInput } from '../ui/TagAutocompleteInput';
import { CharacterAutocompleteInput } from '../ui/CharacterAutocompleteInput';
import { notifications } from '@mantine/notifications';
import type { Set } from '../../api/model';

interface CreateSetModalProps {
    opened: boolean;
    onClose: () => void;
    onSuccess: (newSet: Set) => void;
}

export function CreateSetModal({ opened, onClose, onSuccess }: CreateSetModalProps) {
    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 });
    const createSetMutation = useCreateSetApiSetsPost();
    const createCreatorMutation = useCreateCreatorApiCreatorsPost();
    
    const [title, setTitle] = useState('');
    const [creatorNames, setCreatorNames] = useState<string[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [characters, setCharacters] = useState<string[]>([]);
    const [notes, setNotes] = useState('');
    
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
                    source_url: undefined, // Or leave it off completely
                    local_path: undefined, // Backend will auto-generate using base_library_path
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
            notifications.show({
                title: 'Error',
                message: 'Failed to create the new set.',
                color: 'red'
            });
        }
    };

    return (
        <Modal 
            opened={opened} 
            onClose={onClose} 
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
                
                <CharacterAutocompleteInput
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
                    <Button variant="subtle" onClick={onClose}>Cancel</Button>
                    <Button 
                        onClick={handleCreate} 
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
