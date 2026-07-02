/**
 * @file
 * Module: Image Edit Modal
 * Description: Modal component for editing metadata (rating, tags, notes, etc.) of a single image and handling its deletion.
 */
import { Modal, Stack, TextInput, Textarea, Button, NumberInput, SegmentedControl, Text, ColorInput, Center, Box, Group } from '@mantine/core';
import { useState, useMemo } from 'react';
import { IconAlertTriangle, IconExclamationCircle, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import { useUpdateImageApiImagesImageIdPatch, useDeleteImageApiImagesImageIdDelete } from '../../api/generated/images/images';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import type { Image as ImageModel, ImageUpdate, ImageDetail } from '../../api/model';
import { ImageRating } from '../../types/enums';
import { TagAutocompleteInput } from '../ui/TagAutocompleteInput';

interface ImageEditModalProps {
    image: ImageModel | null;
    opened: boolean;
    onClose: () => void;
    onUpdated: () => void;
    zIndex?: number;
}

const MODAL_Z_INDEX = 3000;
const CONFIRM_MODAL_Z_INDEX_OFFSET = 10;

export function ImageEditModal({ image, opened, onClose, onUpdated, zIndex = MODAL_Z_INDEX }: ImageEditModalProps) {
    const updateMutation = useUpdateImageApiImagesImageIdPatch();
    const deleteMutation = useDeleteImageApiImagesImageIdDelete();
    
    const [form, setForm] = useState<ImageUpdate>({
        filename: '',
        notes: '',
        sort_order: 0,
        aspect_ratio_label: '',
        rating: ImageRating.SAFE,
        dominant_color: '',
        tags: []
    });

    const [prevImageId, setPrevImageId] = useState<number | null>(null);
    if (image && image.id !== prevImageId) {
        setPrevImageId(image.id);
        setForm({
            filename: image.filename || '',
            notes: image.notes || '',
            sort_order: image.sort_order || 0,
            aspect_ratio_label: image.aspect_ratio_label || '',
            rating: image.rating || ImageRating.SAFE,
            dominant_color: image.dominant_color || '',
            tags: (image as ImageDetail).tags || []
        });
    }

    const isFormDirty = useMemo(() => {
        if (!image) return false;
        const originalTags = (image as ImageDetail).tags || [];
        
        const arraysEqual = (a: string[], b: string[]) => {
            if (a.length !== b.length) return false;
            const sortedA = [...a].sort();
            const sortedB = [...b].sort();
            return sortedA.every((val, idx) => val === sortedB[idx]);
        };

        return (
            form.filename !== (image.filename || '') ||
            form.notes !== (image.notes || '') ||
            form.sort_order !== (image.sort_order || 0) ||
            form.aspect_ratio_label !== (image.aspect_ratio_label || '') ||
            form.rating !== (image.rating || ImageRating.SAFE) ||
            form.dominant_color !== (image.dominant_color || '') ||
            !arraysEqual(form.tags || [], originalTags)
        );
    }, [form, image]);

    const resetForm = () => {
        if (image) {
            setForm({
                filename: image.filename || '',
                notes: image.notes || '',
                sort_order: image.sort_order || 0,
                aspect_ratio_label: image.aspect_ratio_label || '',
                rating: image.rating || ImageRating.SAFE,
                dominant_color: image.dominant_color || '',
                tags: (image as ImageDetail).tags || []
            });
        }
    };

    const handleClose = () => {
        if (isFormDirty) {
            modals.openConfirmModal({
                title: 'Unsaved Changes',
                centered: true,
                zIndex: zIndex + CONFIRM_MODAL_Z_INDEX_OFFSET,
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
            onClose();
        }
    };

    const handleSave = async () => {
        if (!image) return;
        try {
            await updateMutation.mutateAsync({
                imageId: image.id,
                data: form
            });
            notifications.show({ title: 'Success', message: 'Image updated', color: 'green' });
            onUpdated();
            onClose();
        } catch {
            notifications.show({ title: 'Error', message: 'Could not update image', color: 'red' });
        }
    };

    const handleDelete = () => {
        if (!image) return;
        
        modals.openConfirmModal({
            title: 'Delete Image',
            centered: true,
            zIndex: zIndex + CONFIRM_MODAL_Z_INDEX_OFFSET,
            children: (
                <Text size="sm">
                    Are you sure you want to delete this image? This will permanently remove the file from your computer.
                </Text>
            ),
            labels: { confirm: 'Delete permanently', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    await deleteMutation.mutateAsync({ imageId: image.id });
                    notifications.show({ title: 'Image deleted', message: 'The image has been permanently removed.', color: 'blue' });
                    onUpdated();
                    onClose();
                } catch {
                    notifications.show({ title: 'Error', message: 'Could not delete image', color: 'red' });
                }
            },
        });
    };


    return (
        <Modal opened={opened} onClose={handleClose} title="Edit Image Metadata" radius="md" zIndex={zIndex}>
            <Stack gap="md">
                <TextInput 
                    label="Filename" 
                    value={form.filename || ''} 
                    onChange={(e) => setForm({ ...form, filename: e.currentTarget.value })}
                />
                
                <Text size="sm" fw={500} mb={-10}>Content Rating</Text>
                <SegmentedControl
                    value={form.rating || ImageRating.SAFE}
                    onChange={(v) => setForm({ ...form, rating: v })}
                    data={[
                        { 
                            label: (
                                <Center style={{ gap: 10 }}>
                                    <IconShieldCheck size={16} />
                                    <Box>Safe</Box>
                                </Center>
                            ), 
                            value: ImageRating.SAFE 
                        },
                        { 
                            label: (
                                <Center style={{ gap: 10 }}>
                                    <IconAlertTriangle size={16} color="var(--mantine-color-yellow-6)" />
                                    <Box>Questionable</Box>
                                </Center>
                            ), 
                            value: ImageRating.QUESTIONABLE 
                        },
                        { 
                            label: (
                                <Center style={{ gap: 10 }}>
                                    <IconExclamationCircle size={16} color="var(--mantine-color-red-6)" />
                                    <Box>Explicit</Box>
                                </Center>
                            ), 
                            value: ImageRating.EXPLICIT 
                        },
                    ]}
                />

                <ColorInput 
                    label="Dominant Color" 
                    placeholder="Hex code (e.g. #FF0055)"
                    value={form.dominant_color || ''} 
                    onChange={(v) => setForm({ ...form, dominant_color: v })}
                    format="hex"
                />

                <TagAutocompleteInput 
                    label="Tags"
                    placeholder="Add tags..."
                    value={form.tags || []}
                    onChange={(tags) => setForm({ ...form, tags })}
                />

                <TextInput 
                    label="Aspect Ratio Label" 
                    placeholder="e.g. 16:9, Mobile"
                    value={form.aspect_ratio_label || ''} 
                    onChange={(e) => setForm({ ...form, aspect_ratio_label: e.currentTarget.value })}
                />
                
                <NumberInput 
                    label="Sort Order" 
                    value={form.sort_order || 0} 
                    onChange={(v) => setForm({ ...form, sort_order: Number(v) })}
                />
                
                <Textarea 
                    label="Notes" 
                    placeholder="Specific notes for this image..."
                    value={form.notes || ''} 
                    onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })}
                    minRows={3}
                />
                
                <Group grow mt="md">
                    <Button 
                        variant="light" 
                        color="red" 
                        leftSection={<IconTrash size={16} />} 
                        onClick={handleDelete}
                        loading={deleteMutation.isPending}
                    >
                        Delete Image
                    </Button>
                    <Button onClick={handleSave} loading={updateMutation.isPending}>Save Changes</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
