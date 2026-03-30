import { Title, Text, Container, Stack, SimpleGrid, Paper, Group, ActionIcon, UnstyledButton, rem, ThemeIcon } from '@mantine/core';
import { IconArrowLeft, IconFileSearch, IconChevronRight, IconCrop } from '@tabler/icons-react';
import { useState } from 'react';
import { FolderParser } from '../../components/tools/FolderParser';
import { ImageCropper } from '../../components/tools/ImageCropper';

interface Tool {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    color: string;
}

const TOOLS: Tool[] = [
    {
        id: 'folder-parser',
        title: 'Folder Parser',
        description: 'Identify Creators and Sets from folder names and track files.',
        icon: <IconFileSearch style={{ width: rem(32), height: rem(32) }} />,
        color: 'blue'
    },
    {
        id: 'image-cropper',
        title: 'Image Cropper',
        description: 'Crop and resize images for your collection.',
        icon: <IconCrop style={{ width: rem(32), height: rem(32) }} />,
        color: 'orange'
    }
];

export default function Tools() {
    const [activeTool, setActiveTool] = useState<string | null>(null);

    const activeToolData = TOOLS.find(t => t.id === activeTool);

    return (
        <Container size="xl">
            <Stack gap="xl">
                <Group justify="space-between" align="flex-start">
                    <div>
                        <Group gap="sm" mb="xs">
                            {activeTool && (
                                <ActionIcon 
                                    variant="subtle" 
                                    color="gray" 
                                    onClick={() => setActiveTool(null)}
                                    size="lg"
                                >
                                    <IconArrowLeft size={24} />
                                </ActionIcon>
                            )}
                            <Title order={1}>{activeToolData ? activeToolData.title : '🛠️ Wallpaper Tools'}</Title>
                        </Group>
                        <Text c="dimmed">
                            {activeToolData 
                                ? activeToolData.description 
                                : 'Automation and utility scripts to manage your collection.'}
                        </Text>
                    </div>
                </Group>

                {!activeTool ? (
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                        {TOOLS.map((tool) => (
                            <UnstyledButton 
                                key={tool.id} 
                                onClick={() => setActiveTool(tool.id)}
                                style={{ height: '100%' }}
                            >
                                <Paper 
                                    withBorder 
                                    p="xl" 
                                    radius="md" 
                                    h="100%"
                                    style={(theme) => ({
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        '&:hover': {
                                            transform: 'translateY(-4px)',
                                            boxShadow: theme.shadows.md,
                                            borderColor: `var(--mantine-color-${tool.color}-filled)`
                                        }
                                    })}
                                >
                                    <Stack gap="md" h="100%" justify="space-between">
                                        <Stack gap="md">
                                            <ThemeIcon size={50} radius="md" variant="light" color={tool.color}>
                                                {tool.icon}
                                            </ThemeIcon>
                                            <div>
                                                <Text fw={700} size="lg">{tool.title}</Text>
                                                <Text size="sm" c="dimmed" mt={4}>{tool.description}</Text>
                                            </div>
                                        </Stack>
                                        <Group justify="flex-end" mt="xs">
                                            <IconChevronRight size={18} color="var(--mantine-color-gray-5)" />
                                        </Group>
                                    </Stack>
                                </Paper>
                            </UnstyledButton>
                        ))}
                    </SimpleGrid>
                ) : (
                    <Stack>
                        {activeTool === 'folder-parser' && <FolderParser />}
                        {activeTool === 'image-cropper' && <ImageCropper />}
                    </Stack>
                )}
            </Stack>
        </Container>
    );
}
