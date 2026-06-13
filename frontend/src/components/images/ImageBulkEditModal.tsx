/**
 * @file
 * Module: Image Bulk Edit Modal
 * Description: Modal component for applying bulk operations (ratings, notes) to multiple selected images within a set.
 */
import { Modal, Stack, SegmentedControl, Text, Button, Textarea, Group } from '@mantine/core';
import { IconCheck, IconNotes } from '@tabler/icons-react';
import { useState } from 'react';
import { BulkOperationMode, ImageRating } from '../../types/enums';

interface ImageBulkEditModalProps {
    opened: boolean;
    onClose: () => void;
    onConfirm: (data: Partial<{ rating: string; notes: string }>, mode: BulkOperationMode) => void;
    loading: boolean;
    selectedCount: number;
}

export function ImageBulkEditModal({ opened, onClose, onConfirm, loading, selectedCount }: ImageBulkEditModalProps) {
    const [rating, setRating] = useState<string | null>(null);
    const [notes, setNotes] = useState('');

    const handleConfirm = () => {
        const updateData: Partial<{ rating: string; notes: string }> = {};
        if (rating) updateData.rating = rating;
        if (notes) updateData.notes = notes;

        onConfirm(updateData, BulkOperationMode.REPLACE);
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
                            { label: 'Safe', value: ImageRating.SAFE },
                            { label: 'Questionable', value: ImageRating.QUESTIONABLE },
                            { label: 'Explicit', value: ImageRating.EXPLICIT },
                        ]}
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
                        disabled={!rating && !notes}
                    >
                        Apply Changes
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
