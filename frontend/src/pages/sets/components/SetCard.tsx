import { Card, Image, Group, Stack, Text, Menu, ActionIcon, Badge, rem } from '@mantine/core';
import { IconDotsVertical, IconExternalLink, IconFolder, IconTrash } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { getImageUrl, FALLBACK_IMAGE } from '../../../utils/fileUtils';
import type { Set } from '../../../api/model';

interface SetCardProps {
    set: Set;
    onDelete: (id: number) => void;
}

export function SetCard({ set, onDelete }: SetCardProps) {
    const navigate = useNavigate();
    
    const handleOpenFolder = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!set.local_path) {
            notifications.show({
                title: 'Error',
                message: 'No local path recorded for this set.',
                color: 'red'
            });
            return;
        }

        try {
            const result = await (window.electron as any).openPath(set.local_path);
            if (result && result.error) {
                notifications.show({
                    title: 'Folder not found',
                    message: `Could not open folder: ${result.error}`,
                    color: 'red'
                });
            }
        } catch (err) {
            console.error('Failed to call openPath:', err);
            notifications.show({
                title: 'Native Error',
                message: 'Could not communicate with the desktop process.',
                color: 'red'
            });
        }
    };

    const coverImageId = set.images && set.images.length > 0 ? set.images[0].id : null;
    const coverUrl = coverImageId ? getImageUrl(coverImageId) : FALLBACK_IMAGE;
    const creatorNames = set.creators?.map(c => c.canonical_name).join(' & ') || 'Unknown Creator';

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Card.Section onClick={() => navigate(`/sets/${set.id}`)} style={{ cursor: 'pointer' }}>
                <Image
                    src={coverUrl}
                    height={160}
                    alt={set.title || 'Untitled Set'}
                    fallbackSrc="https://placehold.co/600x400?text=No+Images"
                />
            </Card.Section>

            <Group justify="space-between" mt="md" mb="xs" wrap="nowrap">
                <Stack gap={0} style={{ overflow: 'hidden', cursor: 'pointer' }} onClick={() => navigate(`/sets/${set.id}`)}>
                    <Text fw={600} size="lg" truncate="end">
                        {set.title || 'Untitled Set'}
                    </Text>
                    <Text size="sm" c="dimmed" truncate="end">
                        {creatorNames}
                    </Text>
                </Stack>
                
                <Menu shadow="md" width={200} position="bottom-end">
                    <Menu.Target>
                        <ActionIcon variant="subtle" color="gray">
                            <IconDotsVertical size={18} />
                        </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <Menu.Label>Actions</Menu.Label>
                        <Menu.Item 
                            leftSection={<IconExternalLink style={{ width: rem(14), height: rem(14) }} />}
                            onClick={() => navigate(`/sets/${set.id}`)}
                        >
                            View Details
                        </Menu.Item>
                        <Menu.Item 
                            leftSection={<IconFolder style={{ width: rem(14), height: rem(14) }} />}
                            onClick={handleOpenFolder}
                        >
                            Open Folder
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Label color="red">Danger zone</Menu.Label>
                        <Menu.Item 
                            color="red" 
                            leftSection={<IconTrash style={{ width: rem(14), height: rem(14) }} />}
                            onClick={() => onDelete(set.id)}
                        >
                            Delete Set
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Group>

            <Group gap="xs">
               <Badge variant="light" color="blue">
                   {set.images?.length || 0} Images
               </Badge>
               <Badge variant="outline" color="gray">
                   {set.date_added}
               </Badge>
            </Group>
        </Card>
    );
}
