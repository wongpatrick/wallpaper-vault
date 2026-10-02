/**
 * @file
 * Module: Creator Merge Modal
 * Description: Confirmation dialog when updating a creator's name conflicts with an existing creator.
 */
import { Modal, Stack, Alert, Text, Group, Button } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

export interface CreatorMergeModalProps {
    opened: boolean;
    onClose: () => void;
    conflictingName?: string;
    creatorName: string;
    onConfirm: () => void;
}

export function CreatorMergeModal({
    opened,
    onClose,
    conflictingName,
    creatorName,
    onConfirm
}: CreatorMergeModalProps) {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Creator Already Exists"
            radius="md"
        >
            <Stack gap="md">
                <Alert icon={<IconAlertCircle size="1rem" />} color="yellow">
                    A creator with the name "{conflictingName || creatorName}" already exists. Do you want to merge this creator into the existing one?
                </Alert>
                <Text size="sm" c="dimmed">
                    This will transfer all wallpaper sets to the existing creator and delete this profile.
                </Text>
                <Group grow>
                    <Button variant="default" onClick={onClose}>Cancel</Button>
                    <Button color="yellow" onClick={onConfirm}>Merge Creators</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
