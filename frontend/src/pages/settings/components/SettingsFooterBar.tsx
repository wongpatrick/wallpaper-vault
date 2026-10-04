/**
 * @file
 * Module: SettingsFooterBar Component
 * Description: Fixed footer bar indicating pending unsaved changes and triggering settings form submission.
 */
import { Paper, Container, Group, Text, Button } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';

const ICON_SIZE = 20;
const BUTTON_PX = 40;
const FOOTER_Z_INDEX = 100;

interface SettingsFooterBarProps {
    isDirty: boolean;
    isSaving: boolean;
}

export function SettingsFooterBar({ isDirty, isSaving }: SettingsFooterBarProps) {
    return (
        <Paper
            p="md"
            radius={0}
            style={{
                position: 'fixed',
                bottom: 0,
                left: 'var(--app-shell-navbar-width, 0)',
                right: 0,
                zIndex: FOOTER_Z_INDEX,
                backgroundColor: 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))',
                backdropFilter: 'blur(8px)',
                borderTop: '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
                boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                justifyContent: 'center',
            }}
        >
            <Container size="xl" style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                <Group>
                    {isDirty && (
                        <Text size="sm" c="blue.6" fw={600}>Pending unsaved changes</Text>
                    )}
                    <Button 
                        type="submit"
                        leftSection={<IconDeviceFloppy size={ICON_SIZE} />} 
                        loading={isSaving}
                        disabled={!isDirty}
                        size="md"
                        color="blue"
                        px={BUTTON_PX}
                        radius="md"
                        variant={isDirty ? 'filled' : 'light'}
                    >
                        Apply Changes
                    </Button>
                </Group>
            </Container>
        </Paper>
    );
}
