/**
 * @file
 * Module: Playlist Image List
 * Description: Grid of wallpapers in a playlist, supporting cross-vault and local playlists with drag-and-drop and reordering.
 */
import React from 'react';
import {
    SimpleGrid, Card, Box, Image, Center, Stack, Text, Group, ActionIcon, Badge, Tooltip
} from '@mantine/core';
import {
    IconAlertCircle, IconTrash, IconChevronUp, IconChevronDown, IconGripVertical
} from '@tabler/icons-react';
import { getThumbnailUrl } from '../../utils/fileUtils';
import { VaultBadge } from '../../components/playlists/VaultBadge';
import type { VaultEntry } from '../../types/electron';
import type { Image as ImageModel } from '../../api/model';

const OPACITY_DRAG = 0.4;
const OPACITY_OFFLINE = 0.6;

interface CrossVaultItem {
    vault_id: string;
    image_id: number;
    sort_order: number;
    vault_label?: string;
}

interface LocalImageItem {
    image: ImageModel;
    sort_order: number;
}

interface PlaylistImageListProps {
    isCrossVault: boolean;
    isSmart?: boolean;
    crossVaultImages: CrossVaultItem[];
    imagesWithOrder: LocalImageItem[];
    vaults: VaultEntry[];
    draggedIndex: number | null;
    onDragStart: (idx: number) => void;
    onDragOver: (e: React.DragEvent, idx: number) => void;
    onDrop: (e: React.DragEvent, idx: number) => void;
    onMove: (idx: number, direction: 'up' | 'down') => void;
    onRemoveLocalImage: (imageId: number) => void;
    onRemoveCrossVaultImage: (vaultId: string, imageId: number) => void;
    onImageClick: (idx: number) => void;
}

export function PlaylistImageList({
    isCrossVault,
    isSmart = false,
    crossVaultImages,
    imagesWithOrder,
    vaults,
    draggedIndex,
    onDragStart,
    onDragOver,
    onDrop,
    onMove,
    onRemoveLocalImage,
    onRemoveCrossVaultImage,
    onImageClick
}: PlaylistImageListProps) {
    if (isCrossVault) {
        return (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
                {crossVaultImages.map((item, idx) => {
                    const { vault_id, image_id, sort_order, vault_label } = item;
                    const vault = vaults.find(v => v.vaultId === vault_id || v.id === vault_id);
                    const isOnline = vault ? (vault.isLocal || vault.status === 'online') : true;
                    const cleanUrl = vault?.url ? vault.url.replace(/\/+$/, '') : '';
                    const thumbUrl = `${cleanUrl}/api/thumbnails/${image_id}.webp`;

                    return (
                        <Card
                            key={`${vault_id}-${image_id}`}
                            shadow="sm"
                            padding={0}
                            radius="md"
                            withBorder
                            draggable={true}
                            onDragStart={() => onDragStart(idx)}
                            onDragOver={(e) => onDragOver(e, idx)}
                            onDrop={(e) => onDrop(e, idx)}
                            style={{
                                overflow: 'hidden',
                                position: 'relative',
                                transition: 'transform 0.2s ease',
                                opacity: draggedIndex === idx ? OPACITY_DRAG : (isOnline ? 1 : OPACITY_OFFLINE),
                                cursor: 'grab',
                            }}
                            className="playlist-item-card"
                        >
                            <Box style={{ position: 'relative', height: 180, overflow: 'hidden', backgroundColor: 'var(--mantine-color-dark-7)' }}>
                                {isOnline ? (
                                    <Image
                                        src={thumbUrl}
                                        alt={`Image ${image_id}`}
                                        loading="lazy"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        fallbackSrc="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%23555'><rect width='100' height='100'/></svg>"
                                    />
                                ) : (
                                    <Center h={180}>
                                        <Stack align="center" gap={4}>
                                            <IconAlertCircle size={28} color="gray" />
                                            <Text size="xs" c="dimmed" fw={600}>
                                                Vault Offline
                                            </Text>
                                        </Stack>
                                    </Center>
                                )}

                                {/* Top Controls Overlay */}
                                <Box
                                    style={{
                                        position: 'absolute',
                                        top: 8,
                                        left: 8,
                                        right: 8,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        zIndex: 10
                                    }}
                                >
                                    <Group gap={6}>
                                        <ActionIcon
                                            variant="glass"
                                            color="dark"
                                            size="md"
                                            radius="md"
                                            style={{ cursor: 'grab', backgroundColor: 'rgba(0,0,0,0.5)', border: 'none' }}
                                        >
                                            <IconGripVertical size={16} color="white" />
                                        </ActionIcon>
                                        <VaultBadge vaultId={vault_id} label={vault_label} size="xs" />
                                    </Group>

                                    <ActionIcon
                                        variant="filled"
                                        color="red"
                                        size="md"
                                        radius="md"
                                        onClick={() => onRemoveCrossVaultImage(vault_id, image_id)}
                                        style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                                        title="Remove from cross-vault playlist"
                                    >
                                        <IconTrash size={14} />
                                    </ActionIcon>
                                </Box>

                                {/* Info Overlay */}
                                <Box
                                    style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                                        color: 'white',
                                        padding: '8px',
                                        pointerEvents: 'none'
                                    }}
                                >
                                    <Text size="xs" truncate="end" fw={600}>
                                        Image #{image_id}
                                    </Text>
                                </Box>
                            </Box>

                            {/* Bottom Reorder Buttons */}
                            <Group gap="xs" p="xs" justify="space-between" style={{ backgroundColor: 'var(--mantine-color-body)' }}>
                                <Badge size="sm" variant="light" color="gray">
                                    Pos: {sort_order}
                                </Badge>
                                <Group gap={4}>
                                    <Tooltip label="Move Up">
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            size="sm"
                                            onClick={() => onMove(idx, 'up')}
                                            disabled={idx === 0}
                                        >
                                            <IconChevronUp size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label="Move Down">
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            size="sm"
                                            onClick={() => onMove(idx, 'down')}
                                            disabled={idx === crossVaultImages.length - 1}
                                        >
                                            <IconChevronDown size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Group>
                        </Card>
                    );
                })}
            </SimpleGrid>
        );
    }

    return (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
            {imagesWithOrder.map((item, idx) => {
                const { image, sort_order } = item;
                return (
                    <Card
                        key={image.id}
                        shadow="sm"
                        padding={0}
                        radius="md"
                        withBorder
                        draggable={!isSmart}
                        onDragStart={() => onDragStart(idx)}
                        onDragOver={(e) => onDragOver(e, idx)}
                        onDrop={(e) => onDrop(e, idx)}
                        style={{
                            overflow: 'hidden',
                            position: 'relative',
                            transition: 'transform 0.2s ease',
                            opacity: draggedIndex === idx ? OPACITY_DRAG : 1,
                            cursor: isSmart ? 'default' : 'grab'
                        }}
                        className="playlist-item-card"
                    >
                        <Box style={{ position: 'relative', height: 180, overflow: 'hidden' }}>
                            <Image
                                src={getThumbnailUrl(image.id, 'md', image.phash || image.file_size || undefined)}
                                alt={image.filename}
                                loading="lazy"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onClick={() => onImageClick(idx)}
                            />
                            
                            {/* Glassmorphic Top Controls (hidden on smart playlists) */}
                            {!isSmart && (
                                <Box
                                    style={{
                                        position: 'absolute',
                                        top: 8,
                                        left: 8,
                                        right: 8,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        zIndex: 10
                                    }}
                                >
                                    <ActionIcon
                                        variant="glass"
                                        color="dark"
                                        size="md"
                                        radius="md"
                                        style={{ cursor: 'grab', backgroundColor: 'rgba(0,0,0,0.5)', border: 'none' }}
                                    >
                                        <IconGripVertical size={16} color="white" />
                                    </ActionIcon>

                                    <ActionIcon
                                        variant="filled"
                                        color="red"
                                        size="md"
                                        radius="md"
                                        onClick={() => onRemoveLocalImage(image.id)}
                                        style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                                        title="Remove from playlist"
                                    >
                                        <IconTrash size={14} />
                                    </ActionIcon>
                                </Box>
                            )}

                            {/* Resolution Info Overlay */}
                            <Box
                                style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                                    color: 'white',
                                    padding: '8px',
                                    pointerEvents: 'none'
                                }}
                            >
                                <Text size="xs" truncate="end" fw={600}>
                                    {image.filename}
                                </Text>
                                <Text size="xs" opacity={0.8}>
                                    {image.width} × {image.height} ({image.aspect_ratio_label})
                                </Text>
                            </Box>
                        </Box>

                        {/* Bottom Accessibility Reorder Buttons (hidden on smart playlists) */}
                        {!isSmart && (
                            <Group gap="xs" p="xs" justify="space-between" style={{ backgroundColor: 'var(--mantine-color-body)' }}>
                                <Badge size="sm" variant="light" color="gray">
                                    Pos: {sort_order}
                                </Badge>
                                <Group gap={4}>
                                    <Tooltip label="Move Up">
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            size="sm"
                                            onClick={() => onMove(idx, 'up')}
                                            disabled={idx === 0}
                                        >
                                            <IconChevronUp size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label="Move Down">
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            size="sm"
                                            onClick={() => onMove(idx, 'down')}
                                            disabled={idx === imagesWithOrder.length - 1}
                                        >
                                            <IconChevronDown size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Group>
                        )}
                    </Card>
                );
            })}
        </SimpleGrid>
    );
}
