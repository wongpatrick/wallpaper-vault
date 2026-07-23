/**
 * @file Rotation page header component.
 */
/* eslint-disable no-magic-numbers */
import { Title, Text, Group, Button, Box } from '@mantine/core';
import { IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react';

interface RotationHeaderProps {
    paused?: boolean;
    onTogglePause: () => void;
}

export function RotationHeader({ paused, onTogglePause }: RotationHeaderProps) {
    return (
        <Group justify="space-between" align="center" wrap="wrap">
            <Box>
                <Title order={1} mb={4}>🖥️ Desktop Rotation Manager</Title>
                <Text c="dimmed">Monitor active wallpapers, trigger skips, and customize rotation pools per screen.</Text>
            </Box>
            <Button
                color={paused ? "green" : "orange"}
                variant="light"
                onClick={onTogglePause}
                leftSection={paused ? <IconPlayerPlay size="1.2rem" /> : <IconPlayerPause size="1.2rem" />}
                size="md"
                radius="md"
                style={{
                    border: paused ? '1px solid var(--mantine-color-green-6)' : '1px solid var(--mantine-color-orange-6)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s ease'
                }}
            >
                {paused ? "Resume Rotation" : "Pause Rotation"}
            </Button>
        </Group>
    );
}
