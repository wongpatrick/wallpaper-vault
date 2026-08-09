/**
 * @file
 * Module: Image Bulk Edit Modal
 * Description: Modal component for applying bulk operations (tags, characters, ratings, notes) to multiple selected images.
 */
import { Modal, Stack, SegmentedControl, Text, Button, Textarea, Group, Alert } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconNotes } from '@tabler/icons-react';
import { useState } from 'react';
import { BulkOperationMode, ImageRating } from '../../types/enums';
import type { ImageUpdate } from '../../api/model';
import { TagAutocompleteInput } from '../ui/TagAutocompleteInput';
import { CharacterTagsInput } from '../ui/CharacterTagsInput';

const ICON_SIZE = 16;

interface ImageBulkEditModalProps {
    opened: boolean;
    onClose: () => void;
    onConfirm: (data: Partial<ImageUpdate>, mode: BulkOperationMode) => void;
    loading: boolean;
    selectedCount: number;
}

export function ImageBulkEditModal({ opened, onClose, onConfirm, loading, selectedCount }: ImageBulkEditModalProps) {
    const [mode, setMode] = useState<BulkOperationMode>(BulkOperationMode.APPEND);
    const [rating, setRating] = useState<string | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [characters, setCharacters] = useState<string[]>([]);
    const [notes, setNotes] = useState('');

    const resetForm = () => {
        setMode(BulkOperationMode.APPEND);
        setRating(null);
        setTags([]);
        setCharacters([]);
        setNotes('');
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleConfirm = () => {
        const updateData: Partial<ImageUpdate> = {};
        if (rating) {
            updateData.rating = rating as ImageRating;
        }
        if (notes.trim()) {
            updateData.notes = notes.trim();
        }
        if (tags.length > 0) {
            updateData.tags = tags;
        }
        if (characters.length > 0) {
            updateData.characters = characters;
        }

        onConfirm(updateData, mode);
        resetForm();
    };

    const hasChanges = Boolean(rating || notes.trim() || tags.length > 0 || characters.length > 0);

    return (
        <Modal opened={opened} onClose={handleClose} title={`Bulk Edit ${selectedCount} Images`} size="md" radius="md">
            <Stack gap="md">
                <Stack gap={4}>
                    <Text size="xs" fw={500} c="dimmed">Operation Mode (Tags, Characters, Notes)</Text>
                    <SegmentedControl
                        fullWidth
                        value={mode}
                        onChange={(v) => setMode(v as BulkOperationMode)}
                        data={[
                            { label: 'Append', value: BulkOperationMode.APPEND },
                            { label: 'Replace', value: BulkOperationMode.REPLACE },
                            { label: 'Remove', value: BulkOperationMode.REMOVE },
                        ]}
                    />
                </Stack>

                {mode === BulkOperationMode.REPLACE && (
                    <Alert
                        icon={<IconAlertTriangle size={ICON_SIZE} />}
                        title="Warning: Replace Mode"
                        color="orange"
                        variant="light"
                        radius="md"
                    >
                        Replace mode will overwrite and replace <strong>all existing tags and characters</strong> on all {selectedCount} selected images with the new selections.
                    </Alert>
                )}

                <Stack gap={4}>
                    <Text size="xs" fw={500} c="dimmed">Rating</Text>
                    <SegmentedControl
                        value={rating || ''}
                        onChange={setRating}
                        data={[
                            { label: 'Unchanged', value: '' },
                            { label: 'Safe', value: ImageRating.SAFE },
                            { label: 'Questionable', value: ImageRating.QUESTIONABLE },
                            { label: 'Explicit', value: ImageRating.EXPLICIT },
                        ]}
                    />
                </Stack>

                <TagAutocompleteInput
                    label="Tags"
                    placeholder="Add tags..."
                    description={
                        mode === BulkOperationMode.APPEND
                            ? 'Tags to add to selected images'
                            : mode === BulkOperationMode.REMOVE
                            ? 'Tags to remove from selected images'
                            : 'Tags to set on selected images (WARNING: completely replaces all existing tags)'
                    }
                    value={tags}
                    onChange={setTags}
                />

                <CharacterTagsInput
                    label="Characters"
                    placeholder="Add characters..."
                    description={
                        mode === BulkOperationMode.APPEND
                            ? 'Characters to add to selected images'
                            : mode === BulkOperationMode.REMOVE
                            ? 'Characters to remove from selected images'
                            : 'Characters to set on selected images (WARNING: completely replaces all existing characters)'
                    }
                    value={characters}
                    onChange={setCharacters}
                />

                <Textarea
                    label="Notes"
                    placeholder={
                        mode === BulkOperationMode.APPEND
                            ? 'Notes to append to selected images...'
                            : mode === BulkOperationMode.REMOVE
                            ? 'Notes will be cleared if specified...'
                            : 'Notes to overwrite on selected images...'
                    }
                    leftSection={<IconNotes size={ICON_SIZE} />}
                    value={notes}
                    onChange={(e) => setNotes(e.currentTarget.value)}
                    minRows={2}
                />

                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" color="gray" onClick={handleClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button 
                        leftSection={<IconCheck size={ICON_SIZE} />} 
                        onClick={handleConfirm}
                        loading={loading}
                        disabled={!hasChanges}
                    >
                        Apply Changes
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
