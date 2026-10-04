/**
 * @file
 * Module: Gallery Header Component
 * Description: Renders the title, subtitle, and selection mode toggle button for the images gallery page.
 */
import { Title, Text, Group, Button, Stack } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';

const ICON_SIZE = 16;

interface GalleryHeaderProps {
    selectionMode: boolean;
    onToggleSelectionMode: () => void;
}

export function GalleryHeader({
    selectionMode,
    onToggleSelectionMode,
}: GalleryHeaderProps) {
    return (
        <Group justify="space-between" align="flex-start" mb="xl">
            <Stack gap={0}>
                <Title order={1} fw={800} style={{ letterSpacing: '-1px' }}>🖼️ Individual Wallpapers</Title>
                <Text c="dimmed" size="lg">Continuous stream of your entire library.</Text>
            </Stack>
            <Button 
                variant={selectionMode ? 'filled' : 'light'} 
                color={selectionMode ? 'blue' : 'gray'}
                leftSection={selectionMode ? <IconCheck size={ICON_SIZE} /> : null}
                onClick={onToggleSelectionMode}
            >
                {selectionMode ? 'Finish Selecting' : 'Select Items'}
            </Button>
        </Group>
    );
}
