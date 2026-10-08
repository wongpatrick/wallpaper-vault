/**
 * @file
 * Module: Image Edit Modal
 * Description: Modal component for editing metadata (rating, tags, notes, etc.) of a single image and handling its deletion.
 */
import { Modal, Stack, TextInput, Textarea, Button, NumberInput, SegmentedControl, Text, ColorInput, Center, Box, Group } from '@mantine/core';
import { IconAlertTriangle, IconExclamationCircle, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import { useDeleteImage } from '../../hooks/useDeleteImage';
import { useAppNotifications } from '../../hooks/useAppNotifications';
import { modals } from '@mantine/modals';
import type { Image as ImageModel } from '../../api/model';
import { ImageRating } from '../../types/enums';
import { TagAutocompleteInput } from '../ui/TagAutocompleteInput';
import { CharacterTagsInput } from '../ui/CharacterTagsInput';
import { useImageEditForm } from './hooks/useImageEditForm';

interface ImageEditModalProps {
    image: ImageModel | null;
    opened: boolean;
    onClose: () => void;
    onUpdated: () => void;
    onDelete?: (imageId: number) => void;
    zIndex?: number;
}

const MODAL_Z_INDEX = 3000;
const CONFIRM_MODAL_Z_INDEX_OFFSET = 10;

export function ImageEditModal({ image, opened, onClose, onUpdated, onDelete, zIndex = MODAL_Z_INDEX }: ImageEditModalProps) {
    const { showNotification } = useAppNotifications();
    const { deleteImage, isDeleting } = useDeleteImage();

    const {
        form,
        setField,
        isSaving,
        handleClose,
        handleSave
    } = useImageEditForm({
        image,
        opened,
        onClose,
        onUpdated,
        zIndex
    });

    const handleDelete = () => {
        if (!image) return;
        const deletedId = image.id;

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
                    await deleteImage(image);
                    showNotification({ title: 'Image deleted', message: 'The image has been permanently removed.', color: 'blue' });
                    if (onDelete) {
                        onDelete(deletedId);
                    } else {
                        onUpdated();
                    }
                    onClose();
                } catch {
                    showNotification({ title: 'Error', message: 'Could not delete image', color: 'red' });
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
                    onChange={(e) => setField('filename', e.currentTarget.value)}
                />

                <Text size="sm" fw={500} mb={-10}>Content Rating</Text>
                <SegmentedControl
                    value={form.rating || ImageRating.SAFE}
                    onChange={(v) => setField('rating', v as ImageRating)}
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
                    onChange={(v) => setField('dominant_color', v)}
                    format="hex"
                />

                <TagAutocompleteInput 
                    label="Tags" 
                    placeholder="Add tags..." 
                    value={form.tags || []} 
                    onChange={(tags) => setField('tags', tags)}
                />

                <CharacterTagsInput 
                    label="Characters" 
                    placeholder="Add characters..." 
                    value={form.characters || []} 
                    onChange={(characters) => setField('characters', characters)}
                />

                <TextInput 
                    label="Aspect Ratio Label" 
                    placeholder="e.g. 16:9, Mobile" 
                    value={form.aspect_ratio_label || ''} 
                    onChange={(e) => setField('aspect_ratio_label', e.currentTarget.value)}
                />

                <NumberInput 
                    label="Sort Order" 
                    value={form.sort_order || 0} 
                    onChange={(v) => setField('sort_order', Number(v))}
                />

                <Textarea 
                    label="Notes" 
                    placeholder="Specific notes for this image..." 
                    value={form.notes || ''} 
                    onChange={(e) => setField('notes', e.currentTarget.value)}
                    minRows={3}
                />

                <Group grow mt="md">
                    <Button 
                        variant="light" 
                        color="red" 
                        leftSection={<IconTrash size={16} />} 
                        onClick={handleDelete}
                        loading={isDeleting}
                    >
                        Delete Image
                    </Button>
                    <Button onClick={handleSave} loading={isSaving}>Save Changes</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
