/**
 * @file
 * Module: Playlist Rotation URL Modal
 * Description: Modal displaying DisplayFusion-compatible rotation URLs with aspect ratio and tag filters.
 */
import { useState } from 'react';
import { Modal, Stack, Text, Group, Select, TextInput, Paper, CopyButton, Tooltip, ActionIcon, Badge, Divider } from '@mantine/core';
import { IconCopy, IconCheck, IconExternalLink, IconSettings } from '@tabler/icons-react';

import { API_BASE_URL } from '../../config';

interface PlaylistRotationUrlModalProps {
    opened: boolean;
    onClose: () => void;
    playlistId: number;
    playlistName: string;
}

export function PlaylistRotationUrlModal({ opened, onClose, playlistId, playlistName }: PlaylistRotationUrlModalProps) {
    const [ratio, setRatio] = useState<string | null>('16x9');
    const [tags, setTags] = useState('');

    // Clean up tags: split by comma, trim, filter empty, then join with slashes
    const cleanTagsPath = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .join('/');

    // Generate Path-based URL
    let pathUrl = `${API_BASE_URL}/api/playlists/${playlistId}/random/file`;
    if (ratio) {
        if (cleanTagsPath) {
            pathUrl = `${API_BASE_URL}/api/playlists/${playlistId}/random/file/${ratio}/tags/${cleanTagsPath}/image.jpg`;
        } else {
            pathUrl = `${API_BASE_URL}/api/playlists/${playlistId}/random/file/${ratio}/image.jpg`;
        }
    } else if (cleanTagsPath) {
        // Fallback to query param if no ratio but tags are specified
        pathUrl = `${API_BASE_URL}/api/playlists/${playlistId}/random/file?tags=${cleanTagsPath}`;
    }

    // Generate Query-based URL
    const queryParams: string[] = [];
    if (ratio) {
        queryParams.push(`aspect_ratio_label=${ratio}`);
    }
    if (tags) {
        // query endpoints expect tags separated by commas or multiple parameters,
        // we'll format it as comma separated for simple query URLs
        const cleanTags = tags.split(',').map(t => t.trim()).filter(t => t.length > 0).join(',');
        if (cleanTags) {
            queryParams.push(`tags=${cleanTags}`);
        }
    }
    const queryUrl = `${API_BASE_URL}/api/playlists/${playlistId}/random/file${queryParams.length > 0 ? `?${queryParams.join('&')}` : ''}`;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="xs">
                    <IconSettings size={20} style={{ color: 'var(--mantine-color-blue-filled)' }} />
                    <Text fw={700}>Rotation URL: {playlistName}</Text>
                </Group>
            }
            radius="md"
            size="lg"
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Configure filters to generate a random wallpaper URL. These URLs are designed for use with wallpaper rotators like DisplayFusion.
                </Text>

                <Group grow align="flex-end">
                    <Select
                        label="Aspect Ratio Filter"
                        placeholder="All aspect ratios"
                        data={[
                            { value: '', label: 'All Ratios (No Filter)' },
                            { value: '16x9', label: '16:9 (Horizontal)' },
                            { value: '9x16', label: '9:16 (Vertical)' },
                            { value: '16x10', label: '16:10' },
                            { value: '21x9', label: '21:9 (Ultrawide)' },
                            { value: '4x3', label: '4:3' },
                        ]}
                        value={ratio}
                        onChange={setRatio}
                        radius="md"
                    />
                    <TextInput
                        label="Tag Filter (Optional)"
                        placeholder="comma, separated, tags"
                        value={tags}
                        onChange={(e) => setTags(e.currentTarget.value)}
                        radius="md"
                    />
                </Group>

                <Divider my="xs" />

                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text fw={600} size="sm">DisplayFusion Compatible (Path-based)</Text>
                        {ratio && (
                            <Badge color="blue" variant="light" size="xs">
                                Recommended
                            </Badge>
                        )}
                    </Group>
                    <Paper
                        withBorder
                        p="xs"
                        radius="md"
                        style={{
                            backgroundColor: 'var(--mantine-color-default)',
                        }}
                    >
                        <Group justify="space-between" wrap="nowrap">
                            <Text
                                size="xs"
                                truncate
                                style={{
                                    fontFamily: 'monospace',
                                    color: 'var(--mantine-color-blue-filled)',
                                    flex: 1,
                                    marginRight: '8px'
                                }}
                            >
                                {pathUrl}
                            </Text>
                            <Group gap={5} wrap="nowrap">
                                <CopyButton value={pathUrl} timeout={2000}>
                                    {({ copied, copy }) => (
                                        <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="top">
                                            <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
                                                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </CopyButton>
                                <Tooltip label="Open in browser" withArrow position="top">
                                    <ActionIcon variant="subtle" color="gray" component="a" href={pathUrl} target="_blank">
                                        <IconExternalLink size={16} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                    </Paper>
                </Stack>

                <Stack gap="xs" mt="sm">
                    <Text fw={600} size="sm">Standard Query URL (Optional)</Text>
                    <Paper
                        withBorder
                        p="xs"
                        radius="md"
                        style={{
                            backgroundColor: 'var(--mantine-color-default)',
                        }}
                    >
                        <Group justify="space-between" wrap="nowrap">
                            <Text
                                size="xs"
                                truncate
                                style={{
                                    fontFamily: 'monospace',
                                    color: 'var(--mantine-color-blue-filled)',
                                    flex: 1,
                                    marginRight: '8px'
                                }}
                            >
                                {queryUrl}
                            </Text>
                            <Group gap={5} wrap="nowrap">
                                <CopyButton value={queryUrl} timeout={2000}>
                                    {({ copied, copy }) => (
                                        <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="top">
                                            <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
                                                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </CopyButton>
                                <Tooltip label="Open in browser" withArrow position="top">
                                    <ActionIcon variant="subtle" color="gray" component="a" href={queryUrl} target="_blank">
                                        <IconExternalLink size={16} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                    </Paper>
                </Stack>
            </Stack>
        </Modal>
    );
}
