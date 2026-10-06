/**
 * @file
 * Module: TaxonomyCloudPanel Component
 * Description: Reusable multi-tab taxonomy browser rendering categorized TagClouds for tags, characters, and franchises across sets or individual wallpapers.
 */
import { Stack, Group, Box, ThemeIcon, Title, Text, Paper, Tabs } from '@mantine/core';
import { IconTags, IconUser, IconFolders, IconPhoto } from '@tabler/icons-react';
import TagCloud from '../../../components/ui/TagCloud';
import type { TaxonomyCloudItem } from '../hooks/useDashboardData';

const CLOUD_HEIGHT = 300;
const THEME_ICON_SIZE = 28;

interface TaxonomyCloudPanelProps {
    scope: 'sets' | 'images';
    tags: TaxonomyCloudItem[];
    characters: TaxonomyCloudItem[];
    franchises: TaxonomyCloudItem[];
}

export function TaxonomyCloudPanel({
    scope,
    tags,
    characters,
    franchises,
}: TaxonomyCloudPanelProps) {
    const isSets = scope === 'sets';
    const headerColor = isSets ? 'violet' : 'teal';
    const HeaderIcon = isSets ? IconFolders : IconPhoto;
    const title = isSets ? 'Set Taxonomy' : 'Image Taxonomy';
    const description = isSets
        ? 'Explore tags, characters, and franchises across your sets — click any to browse'
        : 'Explore tags, characters, and franchises across individual wallpapers — click any to browse';

    const emptyTagsMessage = isSets
        ? 'No set tags yet — start tagging your sets!'
        : 'No image tags yet — start tagging individual images!';

    const emptyCharactersMessage = isSets
        ? 'No characters yet — start adding characters to your sets!'
        : 'No image characters yet — start adding characters to your images!';

    const emptyFranchisesMessage = isSets
        ? 'No franchises yet — start adding franchises to your sets!'
        : 'No image franchises yet — start adding franchises to your images!';

    return (
        <Stack gap="md" mt="md">
            <Group justify="space-between" align="flex-end">
                <Box>
                    <Group gap="xs" mb={4}>
                        <ThemeIcon color={headerColor} variant="light" size={THEME_ICON_SIZE} radius="md">
                            <HeaderIcon size="1rem" />
                        </ThemeIcon>
                        <Title order={3} size="h4">{title}</Title>
                    </Group>
                    <Text size="xs" c="dimmed" ml="xl">
                        {description}
                    </Text>
                </Box>
            </Group>
            <Paper withBorder p="md" radius="md">
                <Tabs defaultValue="tags">
                    <Tabs.List mb="md">
                        <Tabs.Tab value="tags" leftSection={<IconTags size="1rem" />}>
                            Tags ({tags.length})
                        </Tabs.Tab>
                        <Tabs.Tab value="characters" leftSection={<IconUser size="1rem" />}>
                            Characters ({characters.length})
                        </Tabs.Tab>
                        <Tabs.Tab value="franchises" leftSection={<IconFolders size="1rem" />}>
                            Franchises ({franchises.length})
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="tags">
                        <TagCloud 
                            tags={tags} 
                            height={CLOUD_HEIGHT} 
                            emptyMessage={emptyTagsMessage}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="characters">
                        <TagCloud 
                            tags={characters} 
                            height={CLOUD_HEIGHT} 
                            emptyMessage={emptyCharactersMessage}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="franchises">
                        <TagCloud 
                            tags={franchises} 
                            height={CLOUD_HEIGHT} 
                            emptyMessage={emptyFranchisesMessage}
                        />
                    </Tabs.Panel>
                </Tabs>
            </Paper>
        </Stack>
    );
}
