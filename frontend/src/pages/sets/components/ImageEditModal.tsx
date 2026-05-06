import { Modal, Stack, TextInput, Textarea, Button, NumberInput } from '@mantine/core';
import { useState, useEffect } from 'react';
import { useUpdateImageApiImagesImageIdPatch } from '../../../api/generated/images/images';
import { notifications } from '@mantine/notifications';
import type { Image as ImageModel } from '../../../api/model';

interface ImageEditModalProps {
    image: ImageModel | null;
    opened: boolean;
    onClose: () => void;
    onUpdated: () => void;
    zIndex?: number;
}

export function ImageEditModal({ image, opened, onClose, onUpdated, zIndex = 3000 }: ImageEditModalProps) {
    const updateMutation = useUpdateImageApiImagesImageIdPatch();
    
    const [form, setForm] = useState({
        filename: '',
        notes: '',
        sort_order: 0,
        aspect_ratio_label: ''
    });

    useEffect(() => {
        if (image) {
            setForm({
                filename: image.filename || '',
                notes: image.notes || '',
                sort_order: image.sort_order || 0,
                aspect_ratio_label: image.aspect_ratio_label || ''
            });
        }
    }, [image]);

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

    return (
        <Modal opened={opened} onClose={onClose} title="Edit Image Metadata" radius="md" zIndex={zIndex}>
            <Stack gap="md">
                <TextInput 
                    label="Filename" 
                    value={form.filename} 
                    onChange={(e) => setForm({ ...form, filename: e.currentTarget.value })}
                />
                <TextInput 
                    label="Aspect Ratio Label" 
                    placeholder="e.g. 16:9, Mobile"
                    value={form.aspect_ratio_label} 
                    onChange={(e) => setForm({ ...form, aspect_ratio_label: e.currentTarget.value })}
                />
                <NumberInput 
                    label="Sort Order" 
                    value={form.sort_order} 
                    onChange={(v) => setForm({ ...form, sort_order: Number(v) })}
                />
                <Textarea 
                    label="Notes" 
                    placeholder="Specific notes for this image..."
                    value={form.notes} 
                    onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })}
                    minRows={3}
                />
                <Button fullWidth onClick={handleSave} mt="md">Save Changes</Button>
            </Stack>
        </Modal>
    );
}
