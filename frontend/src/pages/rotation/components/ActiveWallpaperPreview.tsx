/**
 * @file Active wallpaper preview card and history strip component.
 */
/* eslint-disable no-magic-numbers */
import { Paper, Center, Loader, Card, Image, Badge, Stack, Group, Box, Tooltip, Text, Button, ActionIcon } from '@mantine/core';
import { IconStar, IconStarFilled, IconBan, IconPhoto, IconPlayerSkipForward, IconAlertCircle } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import { getImageUrl } from '../../../utils/fileUtils';
import type { ImageDetail } from '../../../api/model';

interface ActiveWallpaperPreviewProps {
    currentLoading: boolean;
    focusedImage: ImageDetail | null | undefined;
    activeWallpaper: ImageDetail | null | undefined;
    activeMonitorPreview: string;
    skipPending: boolean;
    onToggleFavorite: () => void;
    onBlacklist: () => void;
    onSkip: () => void;
    historyLoading: boolean;
    historyList: ImageDetail[] | undefined;
    selectedImageId: number | null;
    onSelectImageId: (id: number | null) => void;
}

export function ActiveWallpaperPreview({
    currentLoading,
    focusedImage,
    activeWallpaper,
    activeMonitorPreview,
    skipPending,
    onToggleFavorite,
    onBlacklist,
    onSkip,
    historyLoading,
    historyList,
    selectedImageId,
    onSelectImageId,
}: ActiveWallpaperPreviewProps) {
    const location = useLocation();
    const activeBorderColor = focusedImage?.dominant_color || '#3b82f6';

    if (currentLoading) {
        return (
            <Paper withBorder p="xl" radius="md">
                <Center h={300}>
                    <Loader size="lg" />
                </Center>
            </Paper>
        );
    }

    if (!focusedImage) {
        return (
            <Paper withBorder p="xl" radius="md">
                <Center h={300}>
                    <Stack align="center" gap="xs">
                        <IconAlertCircle size="2.5rem" color="gray" />
                        <Text c="dimmed">No rotation logs found. Serve a random image first.</Text>
                    </Stack>
                </Center>
            </Paper>
        );
    }

    return (
        <Stack gap="md">
            <Card 
                withBorder 
                radius="md" 
                p={0}
                style={{
                    transition: 'all 0.3s ease',
                    border: `2px solid ${activeBorderColor}`,
                    boxShadow: `0 0 20px ${activeBorderColor}26`
                }}
            >
                <Card.Section pos="relative">
                    <Image 
                        src={getImageUrl(focusedImage.id, focusedImage.phash || focusedImage.file_size || undefined)}
                        fallbackSrc="https://placehold.co/600x350?text=No+Wallpaper+Active"
                        alt="Current wallpaper"
                        height={320}
                        fit="cover"
                    />
                    {focusedImage.id === activeWallpaper?.id && (
                        <Badge 
                            color="blue" 
                            variant="filled" 
                            pos="absolute" 
                            top={16} 
                            left={16}
                        >
                            {activeMonitorPreview === 'all' ? 'Active' : `Active on Monitor ${Number(activeMonitorPreview) + 1}`}
                        </Badge>
                    )}
                </Card.Section>

                <Stack p="md" gap="md">
                    <Group justify="space-between" align="center">
                        <Box style={{ flex: 1 }}>
                            <Tooltip label={focusedImage.filename}>
                                <Text fw={600} size="lg" truncate="end" maw={350}>
                                    {focusedImage.filename}
                                </Text>
                            </Tooltip>
                            <Text size="xs" c="dimmed">
                                ID: {focusedImage.id} • {focusedImage.width}x{focusedImage.height}
                            </Text>
                        </Box>
                        <Badge color="teal" variant="light">
                            {focusedImage.aspect_ratio_label}
                        </Badge>
                    </Group>

                    <Group justify="space-between">
                        <Group gap="xs">
                            <Button 
                                variant={focusedImage.is_favorite ? "filled" : "outline"}
                                color="yellow"
                                onClick={onToggleFavorite}
                                leftSection={focusedImage.is_favorite ? <IconStarFilled size="1rem" /> : <IconStar size="1rem" />}
                            >
                                Favorite
                            </Button>
                            <Button 
                                variant="outline" 
                                color="red"
                                onClick={onBlacklist}
                                leftSection={<IconBan size="1rem" />}
                            >
                                Blacklist
                            </Button>
                        </Group>

                        <Group gap="xs">
                            <Button
                                component={Link}
                                to={`/sets/${focusedImage.set_id}`}
                                state={{ from: location.pathname, fromLabel: 'Rotation' }}
                                variant="light"
                                leftSection={<IconPhoto size="1rem" />}
                            >
                                View Set
                            </Button>
                            <Tooltip label="Skip / Load next wallpaper">
                                <ActionIcon 
                                    size="lg" 
                                    color="blue" 
                                    variant="filled"
                                    onClick={onSkip}
                                    loading={skipPending}
                                >
                                    <IconPlayerSkipForward size="1.2rem" />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    </Group>
                </Stack>
            </Card>

            {/* Recent History strip */}
            <Stack gap="xs" mt="sm">
                <Text fw={600} size="sm">Recently Active Wallpapers</Text>
                {historyLoading ? (
                    <Center py="md"><Loader variant="dots" /></Center>
                ) : !historyList || historyList.length === 0 ? (
                    <Text size="xs" c="dimmed">No recent wallpapers recorded.</Text>
                ) : (
                    <Group gap="xs" wrap="nowrap" style={{ overflowX: 'auto', paddingBottom: 5 }}>
                        {historyList.map((img) => (
                            <Tooltip key={img.id} label={img.filename}>
                                <Paper
                                    withBorder
                                    radius="sm"
                                    p={2}
                                    style={{
                                        cursor: 'pointer',
                                        border: focusedImage?.id === img.id ? '2px solid #3b82f6' : '1px solid var(--mantine-color-default-border)',
                                        transition: 'transform 0.2s ease',
                                        flexShrink: 0
                                    }}
                                    onClick={() => onSelectImageId(img.id)}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                >
                                    <Image 
                                        src={getImageUrl(img.id, img.phash || img.file_size || undefined)}
                                        w={80}
                                        h={50}
                                        radius="sm"
                                        fit="cover"
                                        fallbackSrc="https://placehold.co/80x50?text=Hist"
                                    />
                                </Paper>
                            </Tooltip>
                        ))}
                    </Group>
                )}
                {selectedImageId !== null && (
                    <Button 
                        variant="subtle" 
                        size="xs" 
                        onClick={() => onSelectImageId(null)}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Back to Active Wallpaper
                    </Button>
                )}
            </Stack>
        </Stack>
    );
}
