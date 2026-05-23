import { Modal, Box, Group, Stack, Text, Button, ActionIcon, Center, Image, Badge } from '@mantine/core';
import { IconWallpaper, IconX, IconChevronLeft, IconChevronRight, IconEdit, IconAlertTriangle, IconExclamationCircle, IconTrash } from '@tabler/icons-react';
import { getImageUrl } from '../../../utils/fileUtils';
import type { Image as ImageModel } from '../../../api/model';
import { useDeleteImageApiImagesImageIdDelete } from '../../../api/generated/images/images';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';

interface LightboxProps {
    images: ImageModel[];
    selectedIndex: number | null;
    onClose: () => void;
    onSelectIndex: (index: number) => void;
    onEdit: (image: ImageModel) => void;
    onDelete?: () => void;
}

export function Lightbox({ images, selectedIndex, onClose, onSelectIndex, onEdit, onDelete }: LightboxProps) {
    const deleteMutation = useDeleteImageApiImagesImageIdDelete();

    if (selectedIndex === null) return null;

    const currentImage = images[selectedIndex];
    const rating = currentImage.rating || 'safe';
    const tags = currentImage.tags;

    const borderColor = rating === 'explicit' ? 'var(--mantine-color-red-filled)' : 
                        rating === 'questionable' ? 'var(--mantine-color-yellow-filled)' : 
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

    return (
        <Modal
            opened={selectedIndex !== null}
            onClose={onClose}
            fullScreen
            padding={0}
            withCloseButton={false}
            styles={{
                content: { backgroundColor: 'rgba(0,0,0,0.95)' },
                body: { height: '100%', padding: 0 }
            }}
        >
            <Box style={{ height: '100vh', width: '100vw', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {/* Lightbox Header */}
                <Group justify="space-between" p="md" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
                    <Stack gap={0}>
                        <Group gap="xs">
                            <Text c="white" fw={600}>{currentImage.filename}</Text>
                            {rating !== 'safe' && (
                                <Badge 
                                    color={rating === 'explicit' ? 'red' : 'yellow'} 
                                    variant="filled" 
                                    size="xs"
                                    leftSection={rating === 'explicit' ? <IconExclamationCircle size={10} /> : <IconAlertTriangle size={10} />}
                                >
                                    {rating}
                                </Badge>
                            )}
                        </Group>
                        <Group gap={8}>
                            <Text c="gray.5" size="xs">
                                {currentImage.width} x {currentImage.height} • {((currentImage.file_size || 0) / 1024 / 1024).toFixed(2)} MB
                            </Text>
                            {tags && (
                                <Text c="blue.4" size="xs" italic>
                                    #{tags.split(',').map((t: string) => t.trim()).join(' #')}
                                </Text>
                            )}
                        </Group>
                    </Stack>
                    <Group>
                        <Button 
                            leftSection={<IconEdit size={18} />} 
                            variant="subtle" 
                            color="gray" 
                            onClick={() => onEdit(currentImage)}
                        >
                            Edit
                        </Button>
                        <Button 
                            leftSection={<IconTrash size={18} />} 
                            variant="subtle" 
                            color="red" 
                            onClick={handleDelete}
                            loading={deleteMutation.isPending}
                        >
                            Delete
                        </Button>
                        <Button leftSection={<IconWallpaper size={18} />} color="blue" variant="filled">
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
                        src={getImageUrl(currentImage.id)}
                        style={{ 
                            maxHeight: '80vh', 
                            maxWidth: '100%', 
                            objectFit: 'contain',
                            border: rating !== 'safe' ? `4px solid ${borderColor}` : 'none',
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

                {/* Thumbnails Strip */}
                <Box p="md" style={{ backgroundColor: 'rgba(0,0,0,0.5)', overflowX: 'auto' }}>
                    <Group gap="xs" wrap="nowrap" justify="center">
                        {images.map((img, idx) => {
                            const imgRating = img.rating || 'safe';
                            const imgBorderColor = imgRating === 'explicit' ? 'var(--mantine-color-red-filled)' : 
                                                 imgRating === 'questionable' ? 'var(--mantine-color-yellow-filled)' : 
                                                 'transparent';
                            
                            return (
                                <Box 
                                    key={img.id} 
                                    onClick={() => onSelectIndex(idx)}
                                    style={{ 
                                        width: 60, 
                                        height: 40, 
                                        cursor: 'pointer', 
                                        border: selectedIndex === idx ? '2px solid var(--mantine-color-blue-filled)' : 
                                                imgRating !== 'safe' ? `2px solid ${imgBorderColor}` : 'none',
                                        opacity: selectedIndex === idx ? 1 : 0.6,
                                        transition: 'all 0.2s',
                                        position: 'relative'
                                    }}
                                >
                                    <Image src={getImageUrl(img.id)} height={40} fit="cover" />
                                    {imgRating !== 'safe' && (
                                        <Box 
                                            style={{ 
                                                position: 'absolute', 
                                                top: 2, 
                                                right: 2, 
                                                width: 8, 
                                                height: 8, 
                                                borderRadius: '50%', 
                                                backgroundColor: imgRating === 'explicit' ? 'var(--mantine-color-red-filled)' : 'var(--mantine-color-yellow-filled)',
                                                border: '1px solid white'
                                            }} 
                                        />
                                    )}
                                </Box>
                            );
                        })}
                    </Group>
                </Box>
            </Box>
        </Modal>
    );
}
