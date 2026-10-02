/**
 * @file
 * Module: Creator Profile Header
 * Description: Displays creator profile header card including avatar, canonical name, type badge, socials, notes, and management actions.
 */
import { Card, Group, Stack, Title, Badge, Button, Menu, ActionIcon, Text } from '@mantine/core';
import { IconEdit, IconDotsVertical, IconTrash } from '@tabler/icons-react';
import { CreatorAvatar } from '../../../components/creators/CreatorAvatar';
import { CreatorSocialBadges } from '../CreatorSocialBadges';
import type { CreatorWithSets } from '../../../api/model';

export interface CreatorProfileHeaderProps {
    creator: CreatorWithSets;
    onEdit: () => void;
    onDelete: () => void;
}

export function CreatorProfileHeader({ creator, onEdit, onDelete }: CreatorProfileHeaderProps) {
    return (
        <Card withBorder radius="md" p="xl" mb="xl">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Group align="center" gap="xl">
                    <CreatorAvatar imageId={creator.stats?.preview_image_id} size={100} />
                    <Stack gap={4}>
                        <Title order={1}>{creator.canonical_name}</Title>
                        <Group gap="xs" align="center">
                            <Badge size="lg" variant="light" color="blue">{creator.type || 'Creator'}</Badge>
                        </Group>
                        <CreatorSocialBadges socials={creator.socials} />
                    </Stack>
                </Group>

                {creator.id !== 0 && (
                    <Group>
                        <Button 
                            leftSection={<IconEdit size={18} />} 
                            variant="light" 
                            onClick={onEdit}
                        >
                            Edit Profile
                        </Button>
                        <Menu shadow="md" width={200} position="bottom-end">
                            <Menu.Target>
                                <ActionIcon variant="outline" size="lg" radius="md">
                                    <IconDotsVertical size={18} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Label>Management</Menu.Label>
                                <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={onDelete}>
                                    Delete Creator
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                )}
            </Group>

            {creator.notes && (
                <Text mt="xl" size="lg" c="dimmed" fs="italic">
                    "{creator.notes}"
                </Text>
            )}
        </Card>
    );
}
