/**
 * @file
 * Module: Creator Delete Modal
 * Description: Confirmation dialog for permanently deleting a creator profile.
 */
import { Modal, Stack, Alert, Text, Group, Button } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

export interface CreatorDeleteModalProps {
    opened: boolean;
    onClose: () => void;
    onConfirm: () => void;
    loading: boolean;
}

export function CreatorDeleteModal({
    opened,
    onClose,
    onConfirm,
    loading
}: CreatorDeleteModalProps) {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Delete Creator"
            radius="md"
        >
            <Stack gap="md">
                <Alert icon={<IconAlertCircle size="1rem" />} color="red" variant="light">
                    Are you sure you want to delete this creator?
                </Alert>
                <Text size="sm" c="dimmed">
                    This will NOT delete their wallpapers, but they will be marked as "Unknown Creator". This action cannot be undone.
                </Text>
                <Group grow>
                    <Button variant="default" onClick={onClose}>Cancel</Button>
                    <Button color="red" onClick={onConfirm} loading={loading}>Delete</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
