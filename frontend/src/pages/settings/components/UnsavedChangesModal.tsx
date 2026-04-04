import { Modal, Group, Text, Button } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useBlocker } from 'react-router-dom';
import { useEffect } from 'react';

interface UnsavedChangesModalProps {
    isDirty: boolean;
}

export function UnsavedChangesModal({ isDirty }: UnsavedChangesModalProps) {
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            isDirty && currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    return (
        <Modal 
            opened={blocker.state === "blocked"} 
            onClose={() => blocker.reset?.()}
            title={
                <Group gap="xs">
                    <IconAlertTriangle color="var(--mantine-color-orange-6)" size={20} />
                    <Text fw={700}>Unsaved Changes</Text>
                </Group>
            }
            centered
        >
            <Text size="sm" mb="lg">
                You have unsaved changes in your settings. If you leave now, your changes will be lost.
            </Text>
            <Group justify="flex-end" gap="sm">
                <Button variant="subtle" color="gray" onClick={() => blocker.reset?.()}>
                    Stay Here
                </Button>
                <Button color="red" onClick={() => blocker.proceed?.()}>
                    Discard & Leave
                </Button>
            </Group>
        </Modal>
    );
}
