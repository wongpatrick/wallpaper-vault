/**
 * @file
 * Module: ImageLightbox Component
 * Description: Full-screen image viewer supporting keyboard navigation, metadata display, filmstrip thumbnail navigation, and direct image actions (edit/delete).
 */
import { Modal, Box, Group, Stack, Text, Button, ActionIcon, Center, Image, Badge, Tooltip } from '@mantine/core';
import { IconWallpaper, IconX, IconChevronLeft, IconChevronRight, IconEdit, IconAlertTriangle, IconExclamationCircle, IconTrash, IconFolderOpen, IconCrop } from '@tabler/icons-react';
import { getImageUrl, getThumbnailUrl } from '../../utils/fileUtils';
import type { Image as ImageModel } from '../../api/model';
import { useDeleteImageApiImagesImageIdDelete } from '../../api/generated/images/images';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { useNavigate } from 'react-router-dom';
import { ImageRating } from '../../types/enums';
import { useMemo, useEffect } from 'react';

interface ImageLightboxProps {
    images: ImageModel[];
    selectedIndex: number | null;
    onClose: () => void;
    onSelectIndex: (index: number) => void;
    onEdit: (image: ImageModel) => void;
    onDelete?: () => void;
    totalCount?: number;
    disableActions?: boolean;
    onCrop?: (image: ImageModel) => void;
}

const BYTES_PER_KB = 1024;
const OPACITY_DIMMED = 0.5;
const OPACITY_FULL = 1;
const FILMSTRIP_VISIBLE = 7; // Number of thumbnails visible at a time
const FILMSTRIP_HALF = Math.floor(FILMSTRIP_VISIBLE / 2);
const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 100;
const THUMB_GAP = 8;

export function ImageLightbox({ images, selectedIndex, onClose, onSelectIndex, onEdit, onDelete, totalCount, disableActions, onCrop }: ImageLightboxProps) {
    const deleteMutation = useDeleteImageApiImagesImageIdDelete();
    const navigate = useNavigate();

    // Compute the visible filmstrip window
    const filmstripWindow = useMemo(() => {
        if (selectedIndex === null) return [];
        
        let start = selectedIndex - FILMSTRIP_HALF;
        let end = selectedIndex + FILMSTRIP_HALF;
        
        // Clamp to bounds
        if (start < 0) {
            end = Math.min(end - start, images.length - 1);
            start = 0;
        }
        if (end >= images.length) {
            start = Math.max(start - (end - images.length + 1), 0);
            end = images.length - 1;
        }
        
        const window: { index: number; image: ImageModel }[] = [];
        for (let i = start; i <= end; i++) {
            window.push({ index: i, image: images[i] });
        }
        return window;
    }, [selectedIndex, images]);

    // Close lightbox if the index becomes invalid (e.g. after deletion or list reload)
    useEffect(() => {
        if (selectedIndex !== null && (!images || images.length === 0 || selectedIndex >= images.length)) {
            onClose();
        }
    }, [selectedIndex, images, onClose]);

    // Prefetch adjacent full-res images for instant navigation
    useEffect(() => {
        if (selectedIndex === null || !images || selectedIndex >= images.length) return;
        
        const prefetchIndices = [selectedIndex - 1, selectedIndex + 1];
        prefetchIndices.forEach(idx => {
            if (idx >= 0 && idx < images.length) {
                const img = new window.Image();
                img.src = getImageUrl(images[idx].id, images[idx].phash || images[idx].file_size || undefined);
            }
        });
    }, [selectedIndex, images]);

    if (selectedIndex === null) return null;

    const currentImage = images[selectedIndex];
    if (!currentImage) return null;

    const rating = currentImage.rating || ImageRating.SAFE;

    const borderColor = rating === ImageRating.EXPLICIT ? 'var(--mantine-color-red-filled)' : 
                        rating === ImageRating.QUESTIONABLE ? 'var(--mantine-color-yellow-filled)' : 
                        'transparent';

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (selectedIndex > 0) onSelectIndex(selectedIndex - 1);
    };

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (selectedIndex < images.length - 1) onSelectIndex(selectedIndex + 1);
    };

    const handleDelete = () => {
        if (!currentImage) return;
        
        modals.openConfirmModal({
            title: 'Delete Image',
            centered: true,
            children: (
                <Text size="sm">
                    Are you sure you want to delete this image? This will permanently remove the file from your computer.
                </Text>
            ),
            labels: { confirm: 'Delete permanently', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    await deleteMutation.mutateAsync({ imageId: currentImage.id });
                    notifications.show({ title: 'Image deleted', message: 'The image has been permanently removed.', color: 'blue' });
                    onDelete?.();
                    onClose();
                } catch {
                    notifications.show({ title: 'Error', message: 'Could not delete image', color: 'red' });
                }
            },
        });
    };

    const navigateToSet = () => {
        if (currentImage.set_id) {
            onClose();
            navigate(`/sets/${currentImage.set_id}`);
        }
    };

    return (
        <Modal
            opened={selectedIndex !== null}
            onClose={onClose}
            fullScreen
            trapFocus={false}
            padding={0}
            withCloseButton={false}
            styles={{
                content: { backgroundColor: 'rgba(0,0,0,0.95)' },
                body: { height: '100%', padding: 0 }
            }}
        >
            <Box style={{ height: '100vh', width: '100vw', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {/* ImageLightbox Header */}
                <Group justify="space-between" p="md" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, WebkitAppRegion: 'no-drag' }}>
                    <Stack gap={0}>
                        <Group gap="xs">
                            <Tooltip label={currentImage.filename} position="bottom" withArrow>
                                <Text c="white" fw={600} truncate="end" maw={400}>
                                    {currentImage.filename}
                                </Text>
                            </Tooltip>
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
                                {currentImage.width} x {currentImage.height} • {((currentImage.file_size || 0) / BYTES_PER_KB / BYTES_PER_KB).toFixed(2)} MB
                            </Text>
                        </Group>
                    </Stack>
                    <Group>
                        {currentImage.set_id && (
                            <Tooltip label="View Set">
                                <Button 
                                    leftSection={<IconFolderOpen size={18} />} 
                                    variant="subtle" 
                                    color="gray" 
                                    onClick={navigateToSet}
                                >
                                    Set
                                </Button>
                            </Tooltip>
                        )}
                        <Button 
                            leftSection={<IconCrop size={18} />} 
                            variant="subtle" 
                            color="gray" 
                            onClick={() => onCrop?.(currentImage)}
                            disabled={disableActions}
                        >
                            Crop
                        </Button>
                        <Button 
                            leftSection={<IconEdit size={18} />} 
                            variant="subtle" 
                            color="gray" 
                            onClick={() => onEdit(currentImage)}
                            disabled={disableActions}
                        >
                            Edit Metadata
                        </Button>
                        <Button 
                            leftSection={<IconTrash size={18} />} 
                            variant="subtle" 
                            color="red" 
                            onClick={handleDelete}
                            loading={deleteMutation.isPending}
                            disabled={disableActions}
                        >
                            Delete
                        </Button>
                        <Button 
                            leftSection={<IconWallpaper size={18} />} 
                            color="blue" 
                            variant="filled"
                            disabled={disableActions}
                        >
                            Set as Wallpaper
                        </Button>
                        <ActionIcon variant="subtle" color="gray" size="xl" onClick={onClose}>
                            <IconX size={28} />
                        </ActionIcon>
                    </Group>
                </Group>

                {/* Main Image Area */}
                <Center style={{ flex: 1, padding: '40px' }}>
                    <Image
                        src={getImageUrl(currentImage.id, currentImage.phash || currentImage.file_size || undefined)}
                        style={{ 
                            maxHeight: '75vh', 
                            maxWidth: '100%', 
                            objectFit: 'contain',
                            border: rating !== ImageRating.SAFE ? `4px solid ${borderColor}` : 'none',
                            boxSizing: 'border-box',
                            borderRadius: '4px'
                        }}
                    />
                </Center>

                {/* Navigation Arrows */}
                <ActionIcon 
                    variant="transparent" 
                    color="white" 
                    size={60} 
                    onClick={handlePrev}
                    disabled={selectedIndex === 0}
                    style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)' }}
                >
                    <IconChevronLeft size={48} />
                </ActionIcon>

                <ActionIcon 
                    variant="transparent" 
                    color="white" 
                    size={60} 
                    onClick={handleNext}
                    disabled={selectedIndex === images.length - 1}
                    style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)' }}
                >
                    <IconChevronRight size={48} />
                </ActionIcon>

                {/* Filmstrip Thumbnail Navigation */}
                <Box 
                    p="md" 
                    style={{ 
                        backgroundColor: 'rgba(0,0,0,0.6)', 
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8
                    }}
                >
                    {/* Position Counter */}
                    <Text c="gray.4" size="xs" fw={600}>
                        {selectedIndex + 1} / {totalCount || images.length}
                    </Text>

                    {/* Filmstrip */}
                    <Group gap={THUMB_GAP} wrap="nowrap" justify="center">
                        {filmstripWindow.map(({ index, image: img }) => {
                            const imgRating = img.rating || ImageRating.SAFE;
                            const isActive = index === selectedIndex;
                            
                            return (
                                <Box 
                                    key={img.id} 
                                    onClick={() => onSelectIndex(index)}
                                    style={{ 
                                        width: THUMB_WIDTH, 
                                        height: THUMB_HEIGHT, 
                                        cursor: 'pointer', 
                                        borderRadius: 6,
                                        overflow: 'hidden',
                                        border: isActive 
                                            ? '3px solid var(--mantine-color-blue-filled)' 
                                            : imgRating !== ImageRating.SAFE 
                                                ? `2px solid ${imgRating === ImageRating.EXPLICIT ? 'var(--mantine-color-red-filled)' : 'var(--mantine-color-yellow-filled)'}`
                                                : '2px solid transparent',
                                        opacity: isActive ? OPACITY_FULL : OPACITY_DIMMED,
                                        transition: 'all 0.2s ease',
                                        flexShrink: 0,
                                        transform: isActive ? 'scale(1.05)' : 'scale(1)',
                                    }}
                                >
                                    <Image 
                                        src={getThumbnailUrl(img.id, 'sm', img.phash || img.file_size || undefined)} 
                                        height={THUMB_HEIGHT} 
                                        width={THUMB_WIDTH}
                                        fit="cover" 
                                        style={{ display: 'block' }}
                                    />
                                </Box>
                            );
                        })}
                    </Group>
                </Box>
            </Box>
        </Modal>
    );
}
