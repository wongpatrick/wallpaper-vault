/**
 * @file
 * Module: Playlist Detail Page
 * Description: Displays a single custom collection of wallpapers, allowing drag-and-drop reordering, Up/Down navigation, and image removal.
 */
import { useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    Container, Title, Text, Stack, Group, Button, SimpleGrid, Card, Image, ActionIcon, Center, Loader, Alert, Box, Tooltip, Badge
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconAlertCircle, IconArrowLeft, IconTrash, IconChevronUp, IconChevronDown, IconGripVertical, IconCopy, IconPlaylist, IconSparkles
} from '@tabler/icons-react';
import {
    useReadPlaylistApiPlaylistsPlaylistIdGet,
    useRemoveImagesApiPlaylistsPlaylistIdImagesDelete,
    useReorderImagesApiPlaylistsPlaylistIdImagesReorderPut,
    useReadPlaylistRandomImageApiPlaylistsPlaylistIdRandomGet
} from '../../api/generated/playlists/playlists';
import { getThumbnailUrl } from '../../utils/fileUtils';
import { ImageLightbox } from '../../components/images/ImageLightbox';
import { PlaylistRotationUrlModal } from '../../components/playlists/PlaylistRotationUrlModal';

const OPACITY_DRAG = 0.4;

export default function PlaylistDetail() {
    const { playlistId } = useParams<{ playlistId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const numericId = Number(playlistId);

    const { data: playlist, isLoading, error, refetch } = useReadPlaylistApiPlaylistsPlaylistIdGet(numericId);
    const removeMutation = useRemoveImagesApiPlaylistsPlaylistIdImagesDelete();
    const reorderMutation = useReorderImagesApiPlaylistsPlaylistIdImagesReorderPut();
    const randomImageQuery = useReadPlaylistRandomImageApiPlaylistsPlaylistIdRandomGet(numericId, undefined, {
        query: { enabled: false }
    });

    const [lightboxImageIndex, setLightboxImageIndex] = useState<number | null>(null);

    // Drag-and-drop state
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [rotationModalOpened, setRotationModalOpened] = useState(false);

    // List of images extracted from playlist details
    const imagesWithOrder = useMemo(() => {
        if (!playlist?.images) return [];
        // Sort them by their sort_order to display correctly
        return [...playlist.images].sort((a, b) => a.sort_order - b.sort_order);
    }, [playlist]);

    const imagesOnly = useMemo(() => {
        return imagesWithOrder.map(imgOrder => imgOrder.image);
    }, [imagesWithOrder]);

    const handleCopyRotationUrl = () => {
        setRotationModalOpened(true);
    };

    const handleTriggerRandomPreview = async () => {
        try {
            const result = await randomImageQuery.refetch();
            if (result.data) {
                // Find index of the random image in the list to open in lightbox
                const idx = imagesOnly.findIndex(img => img.id === result.data.id);
                if (idx !== -1) {
                    setLightboxImageIndex(idx);
                } else {
                    notifications.show({
                        title: 'Random Image',
                        message: `Fetched: ${result.data.filename}`,
                        color: 'blue'
                    });
                }
            }
        } catch {
            notifications.show({
                title: 'Error',
                message: 'Could not fetch a random image.',
                color: 'red'
            });
        }
    };

    const handleRemoveImage = async (imgId: number) => {
        try {
            await removeMutation.mutateAsync({
                playlistId: numericId,
                data: { image_ids: [imgId] }
            });
            notifications.show({
                title: 'Removed',
                message: 'Wallpaper removed from playlist.',
                color: 'blue'
            });
            refetch();
        } catch {
            notifications.show({
                title: 'Error',
                message: 'Could not remove image.',
                color: 'red'
            });
        }
    };

    const handleReorder = async (newImages: typeof imagesWithOrder) => {
        const imageIds = newImages.map(x => x.image.id);
        try {
            await reorderMutation.mutateAsync({
                playlistId: numericId,
                data: { image_ids: imageIds }
            });
            refetch();
        } catch {
            notifications.show({
                title: 'Reorder Failed',
                message: 'Could not save new order to database.',
                color: 'red'
            });
        }
    };

    const handleMove = async (currentIndex: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= imagesWithOrder.length) return;

        const updated = [...imagesWithOrder];
        // Swap
        const temp = updated[currentIndex];
        updated[currentIndex] = updated[targetIndex];
        updated[targetIndex] = temp;

        await handleReorder(updated);
    };

    // Drag events
    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
    };

    const handleDrop = async (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const updated = [...imagesWithOrder];
        const [draggedItem] = updated.splice(draggedIndex, 1);
        updated.splice(index, 0, draggedItem);

        setDraggedIndex(null);
        await handleReorder(updated);
    };

    if (isLoading) {
        return (
            <Center h={400}>
                <Loader size="xl" />
            </Center>
        );
    }

    if (error || !playlist) {
        return (
            <Container fluid px="xl">
                <Alert icon={<IconAlertCircle size="1.2rem" />} title="Error!" color="red" mb="md">
                    Could not fetch playlist details.
                </Alert>
                <Button 
                    variant="subtle" 
                    leftSection={<IconArrowLeft size={16} />} 
                    onClick={() => {
                        if (location.state?.from) {
                            navigate(-1);
                        } else {
                            navigate('/playlists');
                        }
                    }}
                >
                    Back to {location.state?.fromLabel || "Playlists"}
                </Button>
            </Container>
        );
    }

    return (
        <Container fluid px="xl">
            <Button
                variant="subtle"
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => {
                    if (location.state?.from) {
                        navigate(-1);
                    } else {
                        navigate('/playlists');
                    }
                }}
                mb="xl"
            >
                Back to {location.state?.fromLabel || "Playlists"}
            </Button>

            <Group justify="space-between" align="flex-start" mb="xl">
                <Stack gap={4} style={{ flex: 1 }}>
                    <Title order={1} fw={800} style={{ letterSpacing: '-1.5px' }}>
                        🎵 {playlist.name}
                    </Title>
                    <Text size="md" c="dimmed">
                        {playlist.description || 'No description provided.'}
                    </Text>
                </Stack>

                <Group gap="sm">
                    <Button
                        variant="light"
                        leftSection={<IconSparkles size={16} />}
                        onClick={handleTriggerRandomPreview}
                        disabled={imagesWithOrder.length === 0}
                    >
                        Random Preview
                    </Button>
                    <Button
                        variant="filled"
                        leftSection={<IconCopy size={16} />}
                        onClick={handleCopyRotationUrl}
                    >
                        Copy Rotation URL
                    </Button>
                </Group>
            </Group>

            {imagesWithOrder.length === 0 ? (
                <Center style={{ minHeight: '30vh', flexDirection: 'column' }}>
                    <IconPlaylist size={48} style={{ opacity: 0.1 }} />
                    <Text size="lg" fw={600} c="dimmed" mt="md">
                        This playlist is empty
                    </Text>
                    <Text c="dimmed" size="sm" mt={4} mb="xl">
                        Go to individual wallpapers or sets and select images to add them here.
                    </Text>
                    <Button variant="outline" onClick={() => navigate('/images')}>
                        Browse Wallpapers
                    </Button>
                </Center>
            ) : (
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
                                draggable
                                onDragStart={() => handleDragStart(idx)}
                                onDragOver={(e) => handleDragOver(e, idx)}
                                onDrop={(e) => handleDrop(e, idx)}
                                style={{
                                    overflow: 'hidden',
                                    position: 'relative',
                                    transition: 'transform 0.2s ease',
                                    opacity: draggedIndex === idx ? OPACITY_DRAG : 1,
                                    cursor: 'grab'
                                }}
                                className="playlist-item-card"
                            >
                                <Box style={{ position: 'relative', height: 180, overflow: 'hidden' }}>
                                    <Image
                                        src={getThumbnailUrl(image.id, 'md', image.phash || image.file_size || undefined)}
                                        alt={image.filename}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        onClick={() => setLightboxImageIndex(idx)}
                                    />
                                    
                                    {/* Glassmorphic Top Controls */}
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
                                        {/* Drag Handle */}
                                        <ActionIcon
                                            variant="glass"
                                            color="dark"
                                            size="md"
                                            radius="md"
                                            style={{ cursor: 'grab', backgroundColor: 'rgba(0,0,0,0.5)', border: 'none' }}
                                        >
                                            <IconGripVertical size={16} color="white" />
                                        </ActionIcon>

                                        {/* Remove Button */}
                                        <ActionIcon
                                            variant="filled"
                                            color="red"
                                            size="md"
                                            radius="md"
                                            onClick={() => handleRemoveImage(image.id)}
                                            style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                                            title="Remove from playlist"
                                        >
                                            <IconTrash size={14} />
                                        </ActionIcon>
                                    </Box>

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

                                {/* Bottom Accessibility Reorder Buttons */}
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
                                                onClick={() => handleMove(idx, 'up')}
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
                                                onClick={() => handleMove(idx, 'down')}
                                                disabled={idx === imagesWithOrder.length - 1}
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
            )}

            {/* Lightbox for viewing images */}
            {lightboxImageIndex !== null && (
                <ImageLightbox
                    images={imagesOnly}
                    selectedIndex={lightboxImageIndex}
                    onClose={() => setLightboxImageIndex(null)}
                    onSelectIndex={setLightboxImageIndex}
                    onEdit={() => {}}
                    onDelete={() => {
                        // If deleted globally, we should refetch
                        refetch();
                        setLightboxImageIndex(null);
                    }}
                    disableActions={true} // Readonly mode in playlist preview
                />
            )}

            {/* Rotation URL Generator Modal */}
            <PlaylistRotationUrlModal
                opened={rotationModalOpened}
                onClose={() => setRotationModalOpened(false)}
                playlistId={numericId}
                playlistName={playlist?.name || ''}
            />

            <style dangerouslySetInnerHTML={{ __html: `
                .playlist-item-card:active {
                    cursor: grabbing;
                }
            `}} />
        </Container>
    );
}
