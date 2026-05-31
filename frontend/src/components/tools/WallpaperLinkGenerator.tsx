/**
 * @file
 * Generates URLs for random wallpapers.
 * Creates paths suitable for wallpaper managers like DisplayFusion.
 */
import { useState } from 'react';
import { Paper, Title, Text, Stack, Select, TextInput, Group, CopyButton, ActionIcon, Tooltip, Badge } from '@mantine/core';
import { IconCopy, IconCheck, IconExternalLink, IconWallpaper } from '@tabler/icons-react';

import { API_BASE_URL } from '../../config';

export function WallpaperLinkGenerator() {
    const [ratio, setRatio] = useState<string | null>('16x9');
    const [tags, setTags] = useState('');
    
    // We assume the API is on the same host but different port, or handled via proxy
    // For local dev with DisplayFusion, we should probably use the actual window.location.origin
    // but often DisplayFusion needs the absolute IP/hostname.
    // We use the centralized API_BASE_URL instead of hardcoding the port.
    const baseUrl = `${API_BASE_URL}/api/images/random`;
    
    // Clean up tags: split by comma, trim, filter empty, then join with slashes
    const cleanTagsPath = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .join('/');

    // Path-based URL for better compatibility with DisplayFusion
    const pathUrl = cleanTagsPath 
        ? `${baseUrl}/file/${ratio || '16x9'}/tags/${cleanTagsPath}/image.jpg`
        : `${baseUrl}/file/${ratio || '16x9'}/image.jpg`;
    
    // Query-based URL for more complex filters (tags, etc)
    const queryUrl = `${baseUrl}/file?aspect_ratio_label=${ratio || '16x9'}${tags ? `&tags=${tags}` : ''}`;

    return (
        <Paper withBorder p="xl" radius="md">
            <Stack gap="md">
                <Group>
                    <IconWallpaper size={28} />
                    <Title order={3}>Wallpaper Link Generator</Title>
                </Group>
                
                <Text size="sm" c="dimmed">
                    Generate random wallpaper URLs for use with DisplayFusion or other wallpaper managers.
                </Text>

                <Group grow align="flex-end">
                    <Select
                        label="Aspect Ratio"
                        placeholder="Pick one"
                        data={[
                            { value: '16x9', label: '16:9 (Horizontal)' },
                            { value: '9x16', label: '9:16 (Vertical)' },
                            { value: '16x10', label: '16:10' },
                            { value: '21x9', label: '21:9 (Ultrawide)' },
                            { value: '4x3', label: '4:3' },
                        ]}
                        value={ratio}
                        onChange={setRatio}
                    />
                    <TextInput
                        label="Tags (Optional)"
                        placeholder="cosplay, landscape..."
                        value={tags}
                        onChange={(event) => setTags(event.currentTarget.value)}
                    />
                </Group>

                <Stack gap="xs" mt="md">
                    <Text fw={500} size="sm">DisplayFusion Compatible (Path-based)</Text>
                    <Paper 
                        withBorder 
                        p="xs" 
                        radius="sm" 
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
                                    color: 'var(--mantine-color-blue-filled)'
                                }}
                            >
                                {pathUrl}
                            </Text>
                            <Group gap={5} wrap="nowrap">
                                <CopyButton value={pathUrl} timeout={2000}>
                                    {({ copied, copy }) => (
                                        <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="right">
                                            <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
                                                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </CopyButton>
                                <Tooltip label="Open in browser" withArrow>
                                    <ActionIcon variant="subtle" color="gray" component="a" href={pathUrl} target="_blank">
                                        <IconExternalLink size={16} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                    </Paper>
                    <Badge color="blue" variant="light" size="xs">Recommended for DisplayFusion</Badge>
                </Stack>

                <Stack gap="xs" mt="md">
                    <Text fw={500} size="sm">Advanced Query (Includes Tags)</Text>
                    <Paper 
                        withBorder 
                        p="xs" 
                        radius="sm" 
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
                                    color: 'var(--mantine-color-blue-filled)'
                                }}
                            >
                                {queryUrl}
                            </Text>
                            <Group gap={5} wrap="nowrap">
                                <CopyButton value={queryUrl} timeout={2000}>
                                    {({ copied, copy }) => (
                                        <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="right">
                                            <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
                                                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </CopyButton>
                                <Tooltip label="Open in browser" withArrow>
                                    <ActionIcon variant="subtle" color="gray" component="a" href={queryUrl} target="_blank">
                                        <IconExternalLink size={16} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        </Group>
                    </Paper>
                </Stack>
            </Stack>
        </Paper>
    );
}
