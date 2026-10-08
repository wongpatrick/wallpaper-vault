/**
 * @file
 * Module: SetAsWallpaperModal Component
 * Description: Modal interface allowing users to select target display monitors and fit styles before applying a wallpaper.
 */
import { Modal, Stack, Group, Text, Button, SegmentedControl, Paper, Box, Image, Badge, SimpleGrid, Tooltip } from '@mantine/core';
import { IconWallpaper, IconDeviceDesktop, IconCheck, IconStack } from '@tabler/icons-react';
import { getImageUrl } from '../../utils/fileUtils';
import type { Image as ImageModel } from '../../api/model';
import { useSetWallpaperMutation } from './hooks/useSetWallpaperMutation';

interface SetAsWallpaperModalProps {
    opened: boolean;
    onClose: () => void;
    image: ImageModel | null;
}

export function SetAsWallpaperModal({ opened, onClose, image }: SetAsWallpaperModalProps) {
    const {
        monitors,
        targetMonitor,
        fitStyle,
        isApplying,
        targetLabel,
        previewRatio,
        getPreviewImageStyle,
        handleSelectTarget,
        handleFitStyleChange,
        handleApply
    } = useSetWallpaperMutation({
        image,
        opened,
        onSuccess: onClose
    });

    if (!image) return null;

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
                                justifyCenter: 'center',
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
