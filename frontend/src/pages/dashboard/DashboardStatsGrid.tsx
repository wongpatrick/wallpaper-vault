/**
 * @file
 * Module: Dashboard Stats Grid
 * Description: Displays collection summary statistics cards (images, sets, creators, storage).
 */
import React from 'react';
import { SimpleGrid, Paper, Group, Text, ThemeIcon } from '@mantine/core';
import { IconPhoto, IconFolders, IconUser, IconDatabase } from '@tabler/icons-react';
import { formatBytes } from '../../utils/fileUtils';
import type { LibraryStats } from '../../api/model';

interface StatsCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
}

export function StatsCard({ title, value, icon, color }: StatsCardProps) {
    return (
        <Paper withBorder p="md" radius="md">
            <Group justify="space-between">
                <div>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                        {title}
                    </Text>
                    <Text fw={700} size="xl">
                        {value}
                    </Text>
                </div>
                <ThemeIcon color={color} variant="light" size={38} radius="md">
                    {icon}
                </ThemeIcon>
            </Group>
        </Paper>
    );
}

interface DashboardStatsGridProps {
    stats?: LibraryStats;
}

export function DashboardStatsGrid({ stats }: DashboardStatsGridProps) {
    return (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }} spacing="md">
            <StatsCard 
                title="Total Images" 
                value={stats?.total_images || 0} 
                icon={<IconPhoto size="1.4rem" />} 
                color="blue" 
            />
            <StatsCard 
                title="Wallpaper Sets" 
                value={stats?.total_sets || 0} 
                icon={<IconFolders size="1.4rem" />} 
                color="teal" 
            />
            <StatsCard 
                title="Creators" 
                value={stats?.total_creators || 0} 
                icon={<IconUser size="1.4rem" />} 
                color="grape" 
            />
            <StatsCard 
                title="Vault Size" 
                value={formatBytes(stats?.total_size_bytes || 0)} 
                icon={<IconDatabase size="1.4rem" />} 
                color="orange" 
            />
            <StatsCard 
                title="Database Size" 
                value={formatBytes(stats?.database_size_bytes || 0)} 
                icon={<IconDatabase size="1.4rem" />} 
                color="indigo" 
            />
        </SimpleGrid>
    );
}
