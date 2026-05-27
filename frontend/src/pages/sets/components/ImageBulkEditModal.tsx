/**
 * Module: Image Bulk Edit Modal
 * Description: Modal component for applying bulk operations (ratings, tags, notes) to multiple selected images within a set.
 */
import { Modal, Stack, SegmentedControl, Text, Button, TagsInput, Textarea, Group } from '@mantine/core';
import { IconCheck, IconTags, IconNotes } from '@tabler/icons-react';
import { useState } from 'react';
import { BulkOperationMode } from '../../../api/model';

interface ImageBulkEditModalProps {
    opened: boolean;
    onClose: () => void;
    onConfirm: (data: Partial<{ rating: string; tags: string; notes: string }>, mode: BulkOperationMode) => void;
    loading: boolean;
    selectedCount: number;
}

export function ImageBulkEditModal({ opened, onClose, onConfirm, loading, selectedCount }: ImageBulkEditModalProps) {
    const [rating, setRating] = useState<string | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [notes, setNotes] = useState('');
    const [mode, setMode] = useState<BulkOperationMode>(BulkOperationMode.APPEND);

    const handleConfirm = () => {
        const updateData: Partial<{ rating: string; tags: string; notes: string }> = {};
        if (rating) updateData.rating = rating;
        if (tags.length > 0) updateData.tags = tags.join(' ');
        if (notes) updateData.notes = notes;

        onConfirm(updateData, mode);
    };

    return (
        <Modal opened={opened} onClose={onClose} title={`Bulk Edit ${selectedCount} Images`} size="md" radius="md">
            <Stack gap="md">
                <Stack gap={4}>
                    <Text size="sm" fw={500}>Rating</Text>
                    <SegmentedControl
                        value={rating || ''}
                        onChange={setRating}
                        data={[
                            { label: 'Unchanged', value: '' },
                            { label: 'Safe', value: 'safe' },
                            { label: 'Questionable', value: 'questionable' },
                            { label: 'Explicit', value: 'explicit' },
                        ]}
                    />
                </Stack>

                <Stack gap={4}>
                    <Group justify="space-between">
                        <Text size="sm" fw={500}>Tags</Text>
                        <SegmentedControl
                            size="xs"
                            value={mode}
                            onChange={(val) => setMode(val as BulkOperationMode)}
                            data={[
                                { label: 'Append', value: BulkOperationMode.APPEND },
                                { label: 'Remove', value: BulkOperationMode.REMOVE },
                                { label: 'Replace', value: BulkOperationMode.REPLACE },
                            ]}
                        />
                    </Group>
                    <TagsInput 
                        placeholder="Add or remove tags..." 
                        leftSection={<IconTags size={16} />}
                        value={tags}
                        onChange={setTags}
                        clearable
                    />
                </Stack>

                <Textarea
                    label="Notes"
                    placeholder="Overwrite notes for selected images..."
                    leftSection={<IconNotes size={16} />}
                    value={notes}
                    onChange={(e) => setNotes(e.currentTarget.value)}
                    minRows={2}
                />

                <Group justify="flex-end" mt="xl">
                    <Button variant="subtle" color="gray" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button 
                        leftSection={<IconCheck size={18} />} 
                        onClick={handleConfirm}
                        loading={loading}
                        disabled={!rating && tags.length === 0 && !notes}
                    >
                        Apply Changes
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
