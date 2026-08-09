/**
 * @file
 * Module: SetAsWallpaperModal Component
 * Description: Modal interface allowing users to select target display monitors and fit styles before applying a wallpaper.
 */
import { useState, useEffect } from 'react';
import { Modal, Stack, Group, Text, Button, SegmentedControl, Paper, Box, Image, Badge, SimpleGrid, Tooltip } from '@mantine/core';
import { IconWallpaper, IconDeviceDesktop, IconCheck, IconStack } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useMonitors } from '../../pages/rotation/hooks/useMonitors';
import { getImageUrl } from '../../utils/fileUtils';
import { useSetActiveWallpaperApiRotationHistorySetWallpaperPost } from '../../api/generated/rotation-history/rotation-history';
import type { Image as ImageModel, SetWallpaperRequestStyle } from '../../api/model';

interface SetAsWallpaperModalProps {
    opened: boolean;
    onClose: () => void;
    image: ImageModel | null;
}

const FIT_STYLE_STORAGE_PREFIX = 'wallpaper_fit_style_';
const NOTIFICATION_AUTO_CLOSE_MS = 3000;
const ERROR_AUTO_CLOSE_MS = 4000;
const DEFAULT_PREVIEW_WIDTH = 1920;
const DEFAULT_PREVIEW_HEIGHT = 1080;

export function SetAsWallpaperModal({ opened, onClose, image }: SetAsWallpaperModalProps) {
    const { monitors } = useMonitors();
    const setWallpaperMutation = useSetActiveWallpaperApiRotationHistorySetWallpaperPost();
    const [isApplying, setIsApplying] = useState(false);

    // Target display selection: 'all' or monitor index string ('0', '1', etc.)
    const [targetMonitor, setTargetMonitor] = useState<string>('0');
    const [fitStyle, setFitStyle] = useState<NonNullable<SetWallpaperRequestStyle>>('fill');

    // Initialize or reset selected monitor when modal opens
    useEffect(() => {
        if (opened) {
            if (monitors.length > 0) {
                setTargetMonitor((prev) => {
                    if (prev !== 'all' && monitors.some(m => String(m.index) === prev)) {
                        const savedStyle = (localStorage.getItem(FIT_STYLE_STORAGE_PREFIX + prev) as NonNullable<SetWallpaperRequestStyle>) || 'fill';
                        setFitStyle(savedStyle);
                        return prev;
                    }
                    const defaultIndex = String(monitors[0].index);
                    const savedStyle = (localStorage.getItem(FIT_STYLE_STORAGE_PREFIX + defaultIndex) as NonNullable<SetWallpaperRequestStyle>) || 'fill';
                    setFitStyle(savedStyle);
                    return defaultIndex;
                });
            } else {
                setTargetMonitor('all');
                const savedStyle = (localStorage.getItem(FIT_STYLE_STORAGE_PREFIX + 'all') as NonNullable<SetWallpaperRequestStyle>) || 'fill';
                setFitStyle(savedStyle);
            }
        }
    }, [opened, monitors]);

    // Handle changing target monitor
    const handleSelectTarget = (target: string) => {
        setTargetMonitor(target);
        const savedStyle = (localStorage.getItem(FIT_STYLE_STORAGE_PREFIX + target) as NonNullable<SetWallpaperRequestStyle>) || 'fill';
        setFitStyle(savedStyle);
    };

    // Handle changing fit style
    const handleFitStyleChange = (val: string) => {
        const styleVal = (val || 'fill') as NonNullable<SetWallpaperRequestStyle>;
        setFitStyle(styleVal);
        localStorage.setItem(FIT_STYLE_STORAGE_PREFIX + targetMonitor, styleVal);
    };

    if (!image) return null;

    const selectedMonitorObj = monitors.find(m => String(m.index) === targetMonitor);
    const targetLabel = targetMonitor === 'all'
        ? 'All Displays (Global)'
        : `Monitor ${selectedMonitorObj?.winNum || (parseInt(targetMonitor, 10) + 1)}`;

    const handleApply = async () => {
        setIsApplying(true);
        try {
            const monitorIndex = targetMonitor === 'all' ? -1 : parseInt(targetMonitor, 10);
            
            if (window.electron?.setWallpaper) {
                const res = await window.electron.setWallpaper(image.id, monitorIndex, fitStyle);
                if (res && res.success === false) {
                    throw new Error(res.error || 'Failed to set wallpaper natively');
                }
            } else {
                // Fallback to REST API in web mode
                await setWallpaperMutation.mutateAsync({
                    data: {
                        image_id: image.id,
                        target_monitor: targetMonitor,
                        style: fitStyle
                    }
                });
            }

            localStorage.setItem(FIT_STYLE_STORAGE_PREFIX + targetMonitor, fitStyle);

            notifications.show({
                title: 'Wallpaper Applied',
                message: `Set "${image.filename}" on ${targetLabel} (${fitStyle})`,
                color: 'green',
                icon: <IconCheck size={16} />,
                autoClose: NOTIFICATION_AUTO_CLOSE_MS
            });

            onClose();
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            notifications.show({
                title: 'Failed to Set Wallpaper',
                message: errorMsg,
                color: 'red',
                autoClose: ERROR_AUTO_CLOSE_MS
            });
        } finally {
            setIsApplying(false);
        }
    };

    // Determine preview aspect ratio based on selected monitor or default 16:9
    const previewWidth = selectedMonitorObj ? selectedMonitorObj.bounds.width : DEFAULT_PREVIEW_WIDTH;
    const previewHeight = selectedMonitorObj ? selectedMonitorObj.bounds.height : DEFAULT_PREVIEW_HEIGHT;
    const previewRatio = previewWidth / previewHeight;

    // Map fitStyle to CSS styles for live preview
    const getPreviewImageStyle = () => {
        switch (fitStyle) {
            case 'fit':
                return { width: '100%', height: '100%', objectFit: 'contain' as const };
            case 'stretch':
                return { width: '100%', height: '100%', objectFit: 'fill' as const };
            case 'center':
                return { width: 'auto', height: 'auto', maxWidth: 'none', maxHeight: 'none', objectFit: 'none' as const };
            case 'span':
            case 'fill':
            default:
                return { width: '100%', height: '100%', objectFit: 'cover' as const };
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            zIndex={300}
            title={
                <Group gap="xs">
                    <IconWallpaper size={22} style={{ color: 'var(--mantine-color-blue-filled)' }} />
                    <Text fw={600} size="lg">Set Desktop Wallpaper</Text>
                </Group>
            }
            size="lg"
            centered
            radius="md"
        >
            <Stack gap="md">
                {/* Image Details Header */}
                <Paper withBorder p="sm" radius="md" style={{ backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))' }}>
                    <Group justify="space-between" wrap="nowrap">
                        <Stack gap={2} style={{ minWidth: 0 }}>
                            <Tooltip label={image.filename}>
                                <Text fw={600} size="sm" truncate="end">
                                    {image.filename}
                                </Text>
                            </Tooltip>
                            <Group gap="xs">
                                <Text size="xs" c="dimmed">
                                    {image.width} × {image.height} px
                                </Text>
                                {image.aspect_ratio_label && (
                                    <Badge size="xs" variant="outline" color="gray">
                                        {image.aspect_ratio_label}
                                    </Badge>
                                )}
                            </Group>
                        </Stack>
                    </Group>
                </Paper>

                {/* Target Monitor Selection */}
                <Stack gap="xs">
                    <Text size="sm" fw={600} c="dimmed">Select Target Display</Text>
                    <SimpleGrid cols={monitors.length > 1 ? 3 : 2} spacing="xs">
                        {monitors.map((m) => {
                            const isSelected = targetMonitor === String(m.index);
                            return (
                                <Paper
                                    key={m.index}
                                    withBorder
                                    p="xs"
                                    radius="md"
                                    onClick={() => handleSelectTarget(String(m.index))}
                                    style={{
                                        cursor: 'pointer',
                                        backgroundColor: isSelected 
                                            ? 'light-dark(var(--mantine-color-blue-0), rgba(34, 139, 230, 0.15))' 
                                            : 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))',
                                        borderColor: isSelected ? 'var(--mantine-color-blue-filled)' : undefined,
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                                        <Group gap="xs" wrap="nowrap">
                                            <IconDeviceDesktop size={20} color={isSelected ? 'var(--mantine-color-blue-filled)' : 'gray'} />
                                            <Stack gap={0}>
                                                <Text size="sm" fw={600}>
                                                    Monitor {m.winNum || (m.index + 1)}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {m.bounds.width}×{m.bounds.height}
                                                </Text>
                                            </Stack>
                                        </Group>
                                        {isSelected && <IconCheck size={16} color="var(--mantine-color-blue-filled)" />}
                                    </Group>
                                </Paper>
                            );
                        })}

                        {/* All Displays (Global) Option */}
                        <Paper
                            withBorder
                            p="xs"
                            radius="md"
                            onClick={() => handleSelectTarget('all')}
                            style={{
                                cursor: 'pointer',
                                backgroundColor: targetMonitor === 'all' 
                                    ? 'light-dark(var(--mantine-color-blue-0), rgba(34, 139, 230, 0.15))' 
                                    : 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))',
                                borderColor: targetMonitor === 'all' ? 'var(--mantine-color-blue-filled)' : undefined,
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <Group gap="xs" wrap="nowrap">
                                    <IconStack size={20} color={targetMonitor === 'all' ? 'var(--mantine-color-blue-filled)' : 'gray'} />
                                    <Stack gap={0}>
                                        <Text size="sm" fw={600}>
                                            All Displays
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            Apply Globally
                                        </Text>
                                    </Stack>
                                </Group>
                                {targetMonitor === 'all' && <IconCheck size={16} color="var(--mantine-color-blue-filled)" />}
                            </Group>
                        </Paper>
                    </SimpleGrid>
                </Stack>

                {/* Fit Style Selection */}
                <Stack gap="xs">
                    <Text size="sm" fw={600} c="dimmed">Wallpaper Fit Style</Text>
                    <SegmentedControl
                        value={fitStyle}
                        onChange={handleFitStyleChange}
                        fullWidth
                        data={[
                            { value: 'fill', label: 'Fill (Cover)' },
                            { value: 'fit', label: 'Fit (Letterbox)' },
                            { value: 'stretch', label: 'Stretch' },
                            { value: 'center', label: 'Center' },
                            { value: 'span', label: 'Span' },
                        ]}
                    />
                </Stack>

                {/* Display Frame & Live Preview */}
                <Stack gap="xs">
                    <Text size="sm" fw={600} c="dimmed">Display Preview ({targetLabel})</Text>
                    <Box
                        style={{
                            width: '100%',
                            height: '180px',
                            backgroundColor: '#0c0d0e',
                            borderRadius: '8px',
                            border: '2px solid #2e2f34',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            overflow: 'hidden',
                            position: 'relative'
                        }}
                    >
                        <Box
                            style={{
                                width: 'auto',
                                height: '85%',
                                aspectRatio: `${previewRatio}`,
                                maxWidth: '90%',
                                border: '1px solid #4a4d53',
                                backgroundColor: '#000',
                                overflow: 'hidden',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                position: 'relative',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                            }}
                        >
                            <Image
                                src={getImageUrl(image.id, image.phash || image.file_size || undefined)}
                                alt={image.filename}
                                style={getPreviewImageStyle()}
                            />
                        </Box>
                    </Box>
                </Stack>

                {/* Modal Footer Actions */}
                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" color="gray" onClick={onClose} disabled={isApplying}>
                        Cancel
                    </Button>
                    <Button
                        leftSection={<IconWallpaper size={18} />}
                        color="blue"
                        onClick={handleApply}
                        loading={isApplying}
                    >
                        Apply Wallpaper
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
