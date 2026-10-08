/**
 * @file
 * Module: LightboxHeader Component
 * Description: Header bar for ImageLightbox displaying filename, metadata badges, dimensions, and action buttons.
 */
import { Group, Stack, Tooltip, Text, Badge, ActionIcon } from '@mantine/core';
import {
    IconFolderOpen,
    IconCrop,
    IconTag,
    IconEdit,
    IconTrash,
    IconWallpaper,
    IconX,
    IconExclamationCircle,
    IconAlertTriangle
} from '@tabler/icons-react';
import type { Image as ImageModel } from '../../../api/model';
import type { WithMultiVault } from '../../../types/vault';
import { ImageRating } from '../../../types/enums';

const BYTES_PER_KB = 1024;
const SIDEBAR_WIDTH = 320;

export interface LightboxHeaderProps {
    image: ImageModel;
    isAggregated: boolean;
    sidebarOpen: boolean;
    disableActions?: boolean;
    isDeleting: boolean;
    onClose: () => void;
    onEdit: (image: ImageModel) => void;
    onCrop?: (image: ImageModel) => void;
    onDelete: () => void;
    onSetWallpaper?: (image: ImageModel) => void;
    onToggleSidebar: () => void;
    onNavigateToSet?: () => void;
}

export function LightboxHeader({
    image,
    isAggregated,
    sidebarOpen,
    disableActions = false,
    isDeleting,
    onClose,
    onEdit,
    onCrop,
    onDelete,
    onSetWallpaper,
    onToggleSidebar,
    onNavigateToSet
}: LightboxHeaderProps) {
    const rating = image.rating || ImageRating.SAFE;

    return (
        <Group
            justify="space-between"
            p="md"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: sidebarOpen ? SIDEBAR_WIDTH : 0,
                zIndex: 10,
                WebkitAppRegion: 'no-drag',
                transition: 'right 0.2s ease'
            }}
        >
            <Stack gap={0}>
                <Group gap="xs">
                    <Tooltip label={image.filename} position="bottom" withArrow>
                        <Text c="white" fw={600} truncate="end" maw={400}>
                            {image.filename}
                        </Text>
                    </Tooltip>
                    {isAggregated && (image as WithMultiVault<ImageModel>)._vaultLabel && (
                        <Badge color="teal" variant="dot" size="xs">
                            {(image as WithMultiVault<ImageModel>)._vaultLabel}
                        </Badge>
                    )}
                    {rating !== ImageRating.SAFE && (
                        <Badge 
                            color={rating === ImageRating.EXPLICIT ? 'red' : 'yellow'} 
                            variant="filled" 
                            size="xs"
                            leftSection={rating === ImageRating.EXPLICIT ? <IconExclamationCircle size={10} /> : <IconAlertTriangle size={10} />}
                        >
                            {rating}
                        </Badge>
                    )}
                </Group>
                <Group gap={8}>
                    <Text c="gray.5" size="xs">
                        {image.width} x {image.height} • {((image.file_size || 0) / BYTES_PER_KB / BYTES_PER_KB).toFixed(2)} MB
                    </Text>
                </Group>
            </Stack>

            <Group gap="sm" wrap="nowrap">
                {image.set_id && onNavigateToSet && (
                    <Tooltip label="View Set">
                        <ActionIcon 
                            variant="subtle" 
                            color="gray" 
                            size="lg"
                            onClick={onNavigateToSet}
                        >
                            <IconFolderOpen size={20} />
                        </ActionIcon>
                    </Tooltip>
                )}
                {onCrop && (
                    <Tooltip label="Crop Image">
                        <ActionIcon 
                            variant="subtle" 
                            color="gray" 
                            size="lg"
                            onClick={() => onCrop(image)}
                            disabled={disableActions}
                        >
                            <IconCrop size={20} />
                        </ActionIcon>
                    </Tooltip>
                )}
                <Tooltip label="Toggle Tags Sidebar">
                    <ActionIcon 
                        variant={sidebarOpen ? "filled" : "subtle"} 
                        color={sidebarOpen ? "blue" : "gray"} 
                        size="lg"
                        onClick={onToggleSidebar}
                    >
                        <IconTag size={20} />
                    </ActionIcon>
                </Tooltip>
                <Tooltip label="Edit Metadata">
                    <ActionIcon 
                        variant="subtle" 
                        color="gray" 
                        size="lg"
                        onClick={() => onEdit(image)}
                        disabled={disableActions}
                    >
                        <IconEdit size={20} />
                    </ActionIcon>
                </Tooltip>
                <Tooltip label="Delete Image">
                    <ActionIcon 
                        variant="subtle" 
                        color="red" 
                        size="lg"
                        onClick={onDelete}
                        loading={isDeleting}
                        disabled={disableActions}
                    >
                        <IconTrash size={20} />
                    </ActionIcon>
                </Tooltip>
                {onSetWallpaper && (
                    <Tooltip label="Set as Wallpaper">
                        <ActionIcon 
                            variant="filled" 
                            color="blue" 
                            size="lg"
                            disabled={disableActions}
                            onClick={() => onSetWallpaper(image)}
                        >
                            <IconWallpaper size={20} />
                        </ActionIcon>
                    </Tooltip>
                )}
                <ActionIcon variant="subtle" color="gray" size="xl" onClick={onClose}>
                    <IconX size={28} />
                </ActionIcon>
            </Group>
        </Group>
    );
}
