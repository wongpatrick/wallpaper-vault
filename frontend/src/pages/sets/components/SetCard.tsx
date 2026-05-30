/**
 * @file
 * Module: Set Card Component
 * Description: Displays a preview card for a wallpaper set, showing its cover image, title, creators, and providing contextual actions.
 */
import { Card, Image, Group, Stack, Text, Menu, ActionIcon, Badge, rem, Checkbox, Box, Overlay } from '@mantine/core';
import { IconDotsVertical, IconExternalLink, IconFolder, IconTrash } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { getImageUrl, FALLBACK_IMAGE } from '../../../utils/fileUtils';
import type { Set } from '../../../api/model';

interface SetCardProps {
    set: Set;
    onDelete: (id: number) => void;
    selectionMode?: boolean;
    selected?: boolean;
    onToggleSelect?: () => void;
}

const ICON_SIZE_PX = 14;

export function SetCard({ set, onDelete, selectionMode, selected, onToggleSelect }: SetCardProps) {
    const navigate = useNavigate();
    
    const handleCardClick = () => {
        if (selectionMode && onToggleSelect) {
            onToggleSelect();
        } else {
            navigate(`/sets/${set.id}`);
        }
    };

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
            const result = await window.electron.openPath(set.local_path);
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
        <Card 
            shadow="sm" 
            padding="lg" 
            radius="md" 
            withBorder 
            style={{ 
                cursor: 'pointer',
                borderColor: selected ? 'var(--mantine-color-blue-filled)' : undefined,
                transition: 'border-color 0.2s ease'
            }}
            onClick={handleCardClick}
        >
            <Card.Section style={{ position: 'relative' }}>
                {selectionMode && (
                    <Box style={{ position: 'absolute', top: 10, left: 10, zIndex: 5 }}>
                        <Checkbox 
                            checked={selected} 
                            readOnly
                            size="md"
                            radius="xl"
                        />
                    </Box>
                )}
                
                <Image
                    src={coverUrl}
                    height={160}
                    alt={set.title || 'Untitled Set'}
                    fallbackSrc="https://placehold.co/600x400?text=No+Images"
                    style={{ filter: selected ? 'brightness(0.8)' : undefined }}
                />

                {selected && <Overlay color="var(--mantine-color-blue-light)" backgroundOpacity={0.15} zIndex={1} />}
            </Card.Section>

            <Group justify="space-between" mt="md" mb="xs" wrap="nowrap">
                <Stack gap={0} style={{ overflow: 'hidden' }}>
                    <Text fw={600} size="lg" truncate="end">
                        {set.title || 'Untitled Set'}
                    </Text>
                    <Text size="sm" c="dimmed" truncate="end">
                        {creatorNames}
                    </Text>
                </Stack>
                
                {!selectionMode && (
                    <Menu shadow="md" width={200} position="bottom-end">
                        <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" onClick={(e) => e.stopPropagation()}>
                                <IconDotsVertical size={18} />
                            </ActionIcon>
                        </Menu.Target>

                        <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                            <Menu.Label>Actions</Menu.Label>
                            <Menu.Item 
                                leftSection={<IconExternalLink style={{ width: rem(ICON_SIZE_PX), height: rem(ICON_SIZE_PX) }} />}
                                onClick={() => navigate(`/sets/${set.id}`)}
                            >
                                View Details
                            </Menu.Item>
                            <Menu.Item 
                                leftSection={<IconFolder style={{ width: rem(ICON_SIZE_PX), height: rem(ICON_SIZE_PX) }} />}
                                onClick={handleOpenFolder}
                            >
                                Open Folder
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Label color="red">Danger zone</Menu.Label>
                            <Menu.Item 
                                color="red" 
                                leftSection={<IconTrash style={{ width: rem(ICON_SIZE_PX), height: rem(ICON_SIZE_PX) }} />}
                                onClick={() => onDelete(set.id)}
                            >
                                Delete Set
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                )}
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
