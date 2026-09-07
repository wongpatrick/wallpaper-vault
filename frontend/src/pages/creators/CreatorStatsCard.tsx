/**
 * @file
 * Module: Creator Stats Card
 * Description: Renders the summary statistics grid for a creator (sets, images, storage, aspect ratio).
 */
import { useMemo } from 'react';
import { SimpleGrid, Paper, Group, Text } from '@mantine/core';
import { IconLayersIntersect, IconPhoto, IconDatabase, IconAspectRatio } from '@tabler/icons-react';
import { formatBytes } from '../../utils/fileUtils';
import type { CreatorStats } from '../../api/model';

interface CreatorStatsCardProps {
    stats?: CreatorStats | null;
}

export function CreatorStatsCard({ stats }: CreatorStatsCardProps) {
    const statItems = useMemo(() => {
        return [
            { label: 'Total Sets', value: stats?.total_sets || 0, icon: IconLayersIntersect, color: 'blue' },
            { label: 'Total Images', value: stats?.total_images || 0, icon: IconPhoto, color: 'teal' },
            { label: 'Library Size', value: formatBytes(stats?.total_size_bytes || 0), icon: IconDatabase, color: 'orange' },
            { label: 'Primary Ratio', value: stats?.primary_aspect_ratio || 'N/A', icon: IconAspectRatio, color: 'grape' },
        ];
    }, [stats]);

    return (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} mb={40}>
            {statItems.map((stat) => (
                <Paper key={stat.label} withBorder p="md" radius="md">
                    <Group justify="space-between">
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                            {stat.label}
                        </Text>
                        <stat.icon size={20} color={`var(--mantine-color-${stat.color}-6)`} />
                    </Group>
                    <Group align="flex-end" gap="xs" mt={10}>
                        <Text size="xl" fw={700}>
                            {stat.value}
                        </Text>
                    </Group>
                </Paper>
            ))}
        </SimpleGrid>
    );
}
