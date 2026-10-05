/**
 * @file
 * Module: AspectRatioCard Component
 * Description: Renders the aspect ratio breakdown of the wallpaper library with progress bar metrics.
 */
import { Stack, Title, Paper, Text, Box, Group, Progress } from '@mantine/core';
import { getARColor } from '../../../utils/aspectRatio';

interface AspectRatioCardProps {
    distribution?: Record<string, number>;
    totalImages?: number;
}

export function AspectRatioCard({ distribution = {}, totalImages = 0 }: AspectRatioCardProps) {
    const entries = Object.entries(distribution);

    return (
        <Stack gap="md">
            <Title order={3} size="h4">Aspect Ratio Distribution</Title>
            <Paper withBorder p="md" radius="md">
                <Stack gap="xs">
                    {entries.length === 0 ? (
                        <Text size="sm" c="dimmed" ta="center" py="md">No aspect ratio data available.</Text>
                    ) : (
                        entries.map(([label, count]) => {
                            const percentage = totalImages > 0 ? (count / totalImages) * 100 : 0;
                            return (
                                <Box key={label}>
                                    <Group justify="space-between" mb={2}>
                                        <Text size="sm" fw={500}>{label}</Text>
                                        <Text size="xs" c="dimmed">{count} images ({percentage.toFixed(1)}%)</Text>
                                    </Group>
                                    <Progress 
                                        value={percentage} 
                                        color={getARColor(label)} 
                                        size="sm" 
                                        radius="xl" 
                                    />
                                </Box>
                            );
                        })
                    )}
                </Stack>
            </Paper>
        </Stack>
    );
}
