/**
 * @file
 * Module: Creator Edit Modal
 * Description: Modal dialog for updating creator profile details with dirty-state confirmation.
 */
import { useState, useMemo } from 'react';
import { Modal, Stack, TextInput, Select, Textarea, Button, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { CREATOR_TYPES } from '../../types/enums';
import { CreatorSocialsForm } from './CreatorSocialsForm';
import type { SocialLink } from '../../types/creator';

export interface CreatorEditFormData {
    canonical_name: string;
    type: string;
    notes: string;
    socials: SocialLink[];
}

interface CreatorEditModalProps {
    opened: boolean;
    onClose: () => void;
    initialData: CreatorEditFormData;
    onSave: (data: CreatorEditFormData) => Promise<void>;
    loading?: boolean;
}

export function CreatorEditModal({
    opened,
    onClose,
    initialData,
    onSave,
    loading = false
}: CreatorEditModalProps) {
    const [form, setForm] = useState<CreatorEditFormData>(initialData);
    const [prevInitialData, setPrevInitialData] = useState<CreatorEditFormData>(initialData);

    if (initialData !== prevInitialData) {
        setPrevInitialData(initialData);
        setForm(initialData);
    }

    const isDirty = useMemo(() => {
        return (
            form.canonical_name !== initialData.canonical_name ||
            form.type !== initialData.type ||
            form.notes !== initialData.notes ||
            JSON.stringify(form.socials) !== JSON.stringify(initialData.socials)
        );
    }, [form, initialData]);

    const handleClose = () => {
        if (isDirty) {
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
                    onClose();
                }
            });
        } else {
            onClose();
        }
    };

    const handleSubmit = async () => {
        await onSave(form);
    };

    return (
        <Modal 
            opened={opened} 
            onClose={handleClose} 
            title="Edit Creator Profile"
            radius="md"
        >
            <Stack gap="md">
                <TextInput 
                    label="Artist Name" 
                    value={form.canonical_name} 
                    onChange={(e) => setForm({ ...form, canonical_name: e.currentTarget.value })}
                />
                <Select 
                    label="Creator Type"
                    data={CREATOR_TYPES as unknown as string[]}
                    value={form.type}
                    onChange={(v) => setForm({ ...form, type: v || '' })}
                />
                <Textarea 
                    label="Internal Notes"
                    placeholder="Add links or artist info..."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })}
                    minRows={3}
                />

                <CreatorSocialsForm
                    socials={form.socials || []}
                    onChange={(newSocials) => setForm({ ...form, socials: newSocials })}
                />

                <Button fullWidth onClick={handleSubmit} loading={loading} mt="md">
                    Save Changes
                </Button>
            </Stack>
        </Modal>
    );
}
