/**
 * @file
 * Module: Playlist Header
 * Description: Displays playlist title, badges, description, and action buttons (edit, preview, copy url, add from vault).
 */
import { Group, Stack, Title, Badge, Text, Button } from '@mantine/core';
import { IconPlus, IconEdit, IconSparkles, IconCopy } from '@tabler/icons-react';

interface PlaylistHeaderProps {
    name: string;
    description?: string | null;
    isSmart?: boolean;
    isCrossVault?: boolean;
    totalItemCount: number;
    onAddFromVault?: () => void;
    onEdit: () => void;
    onRandomPreview: () => void;
    onCopyRotationUrl: () => void;
}

export function PlaylistHeader({
    name,
    description,
    isSmart,
    isCrossVault,
    totalItemCount,
    onAddFromVault,
    onEdit,
    onRandomPreview,
    onCopyRotationUrl
}: PlaylistHeaderProps) {
    return (
        <Group justify="space-between" align="flex-start" mb="xl">
            <Stack gap={4} style={{ flex: 1 }}>
                <Title order={1} fw={800} style={{ letterSpacing: '-1.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🎵 {name}
                    {isSmart && <Badge variant="light" color="violet" size="lg">Smart Playlist</Badge>}
                    {isCrossVault && <Badge variant="light" color="indigo" size="lg">Cross-Vault</Badge>}
                </Title>
                <Text size="md" c="dimmed">
                    {description || 'No description provided.'}
                </Text>
            </Stack>

            <Group gap="sm">
                {isCrossVault && onAddFromVault && (
                    <Button
                        variant="light"
                        color="indigo"
                        leftSection={<IconPlus size={16} />}
                        onClick={onAddFromVault}
                    >
                        Add from Vault
                    </Button>
                )}
                <Button
                    variant="light"
                    leftSection={<IconEdit size={16} />}
                    onClick={onEdit}
                >
                    Edit Playlist
                </Button>
                <Button
                    variant="light"
                    leftSection={<IconSparkles size={16} />}
                    onClick={onRandomPreview}
                    disabled={totalItemCount === 0 || isCrossVault}
                >
                    Random Preview
                </Button>
                <Button
                    variant="filled"
                    leftSection={<IconCopy size={16} />}
                    onClick={onCopyRotationUrl}
                >
                    Copy Rotation URL
                </Button>
            </Group>
        </Group>
    );
}
