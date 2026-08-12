/**
 * @file
 * Module: Cache Management Section
 * Description: UI for monitoring and purging application disk caches (AI model weights and generated thumbnails).
 */
import {
    Paper,
    Text,
    Group,
    Stack,
    Button,
    Badge,
    SimpleGrid,
    ThemeIcon,
    Loader,
    Card
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
    IconBrain,
    IconPhoto,
    IconTrash,
    IconCheck,
    IconRefresh
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import {
    useReadCacheStatsApiSettingsCacheGet,
    useClearAiModelsCacheApiSettingsCacheAiModelsDelete,
    useClearThumbnailsCacheApiSettingsCacheThumbnailsDelete,
    getReadCacheStatsApiSettingsCacheGetQueryKey
} from '../../../api/generated/settings/settings';
import { SettingsSection } from './SettingsSection';

export function CacheManagementSection() {
    const queryClient = useQueryClient();
    const { data: cacheStats, isLoading, isRefetching, refetch } = useReadCacheStatsApiSettingsCacheGet();
    const clearAiMutation = useClearAiModelsCacheApiSettingsCacheAiModelsDelete();
    const clearThumbsMutation = useClearThumbnailsCacheApiSettingsCacheThumbnailsDelete();

    const handleClearAiModels = () => {
        modals.openConfirmModal({
            title: 'Clear AI Model Cache',
            children: (
                <Text size="sm">
                    Are you sure you want to delete all cached AI model weights?
                    This will free disk space immediately. Any required models will automatically re-download on next import.
                </Text>
            ),
            labels: { confirm: 'Clear Model Cache', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    const res = await clearAiMutation.mutateAsync({});
                    notifications.show({
                        title: 'AI Cache Cleared',
                        message: res.message || `Freed ${res.human_freed_size}`,
                        color: 'teal',
                        icon: <IconCheck size={16} />
                    });
                    queryClient.invalidateQueries({ queryKey: getReadCacheStatsApiSettingsCacheGetQueryKey() });
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Failed to clear AI model cache';
                    notifications.show({
                        title: 'Error',
                        message,
                        color: 'red'
                    });
                }
            }
        });
    };

    const handleClearThumbnails = () => {
        modals.openConfirmModal({
            title: 'Clear Thumbnail Cache',
            children: (
                <Text size="sm">
                    Are you sure you want to clear all cached preview thumbnails?
                    Thumbnails will regenerate on-the-fly when browsing wallpapers.
                </Text>
            ),
            labels: { confirm: 'Clear Thumbnail Cache', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    const res = await clearThumbsMutation.mutateAsync({});
                    notifications.show({
                        title: 'Thumbnail Cache Cleared',
                        message: res.message || `Freed ${res.human_freed_size}`,
                        color: 'teal',
                        icon: <IconCheck size={16} />
                    });
                    queryClient.invalidateQueries({ queryKey: getReadCacheStatsApiSettingsCacheGetQueryKey() });
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Failed to clear thumbnail cache';
                    notifications.show({
                        title: 'Error',
                        message,
                        color: 'red'
                    });
                }
            }
        });
    };

    const aiStats = cacheStats?.ai_models;
    const thumbStats = cacheStats?.thumbnails;

    return (
        <SettingsSection
            title="Cache & Storage Management"
            description="Inspect disk usage and purge cached neural network models and preview thumbnails to reclaim storage space."
        >
            <Stack gap="md">
                <Group justify="flex-end">
                    <Button
                        size="xs"
                        variant="subtle"
                        leftSection={isRefetching ? <Loader size="xs" /> : <IconRefresh size={14} />}
                        onClick={() => refetch()}
                        disabled={isLoading || isRefetching}
                    >
                        Refresh Storage
                    </Button>
                </Group>

                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    {/* AI Models Cache Card */}
                    <Card withBorder radius="md" p="md" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <Stack gap="sm">
                            <Group justify="space-between" align="flex-start">
                                <Group gap="xs">
                                    <ThemeIcon size="lg" radius="md" color="violet" variant="light">
                                        <IconBrain size={20} />
                                    </ThemeIcon>
                                    <div>
                                        <Text fw={600} size="sm">AI Model Weights</Text>
                                        <Text size="xs" c="dimmed">
                                            {isLoading ? 'Calculating...' : `${aiStats?.model_count ?? 0} model${(aiStats?.model_count ?? 0) === 1 ? '' : 's'} cached`}
                                        </Text>
                                    </div>
                                </Group>
                                <Badge size="lg" variant="filled" color={aiStats?.total_bytes ? 'violet' : 'gray'}>
                                    {isLoading ? <Loader size="xs" color="white" /> : (aiStats?.human_size ?? '0 B')}
                                </Badge>
                            </Group>

                            {aiStats?.models && aiStats.models.length > 0 ? (
                                <Stack gap="xs" mt="xs">
                                    <Text size="xs" fw={600} c="dimmed">Cached Models:</Text>
                                    <Stack gap={6}>
                                        {aiStats.models.map((m) => (
                                            <Paper key={m.name} withBorder p="xs" radius="sm" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                                                <Group justify="space-between">
                                                    <Text size="xs" fw={500} style={{ wordBreak: 'break-all' }}>{m.name}</Text>
                                                    <Badge size="xs" variant="light" color="violet">{m.human_size}</Badge>
                                                </Group>
                                            </Paper>
                                        ))}
                                    </Stack>
                                </Stack>
                            ) : (
                                <Text size="xs" c="dimmed" mt="xs">No AI models are currently cached on disk.</Text>
                            )}
                        </Stack>

                        <Button
                            mt="md"
                            color="red"
                            variant="light"
                            size="xs"
                            leftSection={<IconTrash size={14} />}
                            onClick={handleClearAiModels}
                            loading={clearAiMutation.isPending}
                            disabled={isLoading || (aiStats?.total_bytes ?? 0) === 0}
                        >
                            Clear Model Cache
                        </Button>
                    </Card>

                    {/* Thumbnails Cache Card */}
                    <Card withBorder radius="md" p="md" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <Stack gap="sm">
                            <Group justify="space-between" align="flex-start">
                                <Group gap="xs">
                                    <ThemeIcon size="lg" radius="md" color="blue" variant="light">
                                        <IconPhoto size={20} />
                                    </ThemeIcon>
                                    <div>
                                        <Text fw={600} size="sm">Image Thumbnails</Text>
                                        <Text size="xs" c="dimmed">
                                            {isLoading ? 'Calculating...' : `${thumbStats?.file_count ?? 0} thumbnail preview${(thumbStats?.file_count ?? 0) === 1 ? '' : 's'}`}
                                        </Text>
                                    </div>
                                </Group>
                                <Badge size="lg" variant="filled" color={thumbStats?.total_bytes ? 'blue' : 'gray'}>
                                    {isLoading ? <Loader size="xs" color="white" /> : (thumbStats?.human_size ?? '0 B')}
                                </Badge>
                            </Group>

                            <Text size="xs" c="dimmed" mt="xs">
                                Fast preview images generated across small, medium, and large resolutions for gallery browsing.
                            </Text>
                        </Stack>

                        <Button
                            mt="md"
                            color="red"
                            variant="light"
                            size="xs"
                            leftSection={<IconTrash size={14} />}
                            onClick={handleClearThumbnails}
                            loading={clearThumbsMutation.isPending}
                            disabled={isLoading || (thumbStats?.total_bytes ?? 0) === 0}
                        >
                            Clear Thumbnail Cache
                        </Button>
                    </Card>
                </SimpleGrid>
            </Stack>
        </SettingsSection>
    );
}
