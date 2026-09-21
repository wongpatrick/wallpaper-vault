/**
 * @file
 * Module: Dashboard Page
 * Description: The main landing page displaying library statistics, recent imports, random inspiration, and system health alerts.
 */
import { useMemo } from 'react';
import { 
    Title, 
    Text, 
    Container, 
    SimpleGrid, 
    Paper, 
    Group, 
    Stack, 
    Alert, 
    Button, 
    ThemeIcon, 
    Loader,
    Center,
    rem,
    Box,
    Tabs,
    Progress
} from '@mantine/core';
import { 
    IconAlertCircle, 
    IconExclamationMark, 
    IconInfoCircle, 
    IconUser, 
    IconFolders, 
    IconArrowRight,
    IconTags,
    IconPhoto
} from '@tabler/icons-react';

import { 
    useMultiVaultDashboard,
    useMultiVaultSets,
    useMultiVaultRandomImage,
    useMultiVaultTagCloud,
    useMultiVaultCharacters,
    useMultiVaultFranchises
} from '../../hooks/useMultiVaultQuery';
import { useVault } from '../../hooks/useVault';
import { AggregatedVaultBanner } from '../../components/vault/AggregatedVaultBanner';
import { useNavigate } from 'react-router-dom';
import TagCloud from '../../components/ui/TagCloud';
import { DashboardStatsGrid } from './DashboardStatsGrid';
import { RecentImportsSection } from './RecentImportsSection';
import { RandomInspirationCard } from './RandomInspirationCard';
import { getARColor } from '../../utils/aspectRatio';

const INSPIRATION_ROTATION_INTERVAL_MS = 20000;

export default function Dashboard() {
    const navigate = useNavigate();
    const { switchVault } = useVault();
    
    // 1. Fetch Dashboard Stats
    const { 
        data: dashboard, 
        isLoading: statsLoading, 
        error: statsError,
        isAggregated,
        onlineCount,
        totalVaultsCount,
        offlineVaults,
        partialErrors
    } = useMultiVaultDashboard();
    
    // 2. Fetch Recent Sets
    const { data: recentSets, isLoading: setsLoading } = useMultiVaultSets({
        limit: 5,
        sort_by: 'date_added',
        sort_dir: 'desc'
    });

    // 3. Fetch Random Inspiration with auto-rotation interval
    const { 
        data: randomImage, 
        refetch: refetchInspiration, 
        isFetching: isFetchingInspiration 
    } = useMultiVaultRandomImage(
        { log_rotation: false },
        {
            refetchInterval: INSPIRATION_ROTATION_INTERVAL_MS,
            refetchIntervalInBackground: false,
            staleTime: 0,
            refetchOnMount: 'always',
            refetchOnWindowFocus: true
        }
    );

    // 4. Fetch Tag Clouds (Sets & Images)
    const { data: setTagCloud } = useMultiVaultTagCloud({ limit: 50, scope: 'sets' });
    const { data: imageTagCloud } = useMultiVaultTagCloud({ limit: 50, scope: 'images' });

    // 5. Fetch Characters (Sets & Images)
    const { data: setCharacters } = useMultiVaultCharacters({ limit: 50, scope: 'sets' });
    const { data: imageCharacters } = useMultiVaultCharacters({ limit: 50, scope: 'images' });

    // 6. Fetch Franchises (Sets & Images)
    const { data: setFranchises } = useMultiVaultFranchises({ limit: 50, scope: 'sets' });
    const { data: imageFranchises } = useMultiVaultFranchises({ limit: 50, scope: 'images' });

    // 7. Filter and transform tag clouds into pure tag shapes
    const setTagsOnly = useMemo(() => (setTagCloud || []).filter((t) => !t.type || t.type === 'tag'), [setTagCloud]);
    const imageTagsOnly = useMemo(() => (imageTagCloud || []).filter((t) => !t.type || t.type === 'tag'), [imageTagCloud]);

    // 8. Transform characters data into TagCloudItem shapes
    const characterSetCloud = useMemo(() => {
        return (setCharacters?.items || []).map((c) => ({
            tag: c.name,
            count: c.set_count || 0,
            type: 'character',
            link: `/sets?character=${encodeURIComponent(c.name)}`
        }));
    }, [setCharacters]);

    const characterImageCloud = useMemo(() => {
        return (imageCharacters?.items || []).map((c) => ({
            tag: c.name,
            count: c.image_count || 0,
            type: 'character',
            link: `/images?character=${encodeURIComponent(c.name)}`
        }));
    }, [imageCharacters]);

    // 9. Transform franchises data into TagCloudItem shapes
    const franchiseSetCloud = useMemo(() => {
        return (setFranchises?.items || []).map((f) => ({
            tag: f.name,
            count: f.set_count || 0,
            type: 'franchise',
            link: `/sets?franchise=${encodeURIComponent(f.name)}`
        }));
    }, [setFranchises]);

    const franchiseImageCloud = useMemo(() => {
        return (imageFranchises?.items || []).map((f) => ({
            tag: f.name,
            count: f.image_count || 0,
            type: 'franchise',
            link: `/images?franchise=${encodeURIComponent(f.name)}`
        }));
    }, [imageFranchises]);

    if (statsLoading) {
        return (
            <Center h={400}>
                <Loader size="xl" />
            </Center>
        );
    }

    if (statsError || !dashboard) {
        return (
            <Container fluid px="xl">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error" color="red">
                    Failed to load dashboard data. Please make sure the backend is running.
                </Alert>
            </Container>
        );
    }

    const { stats, health_alerts: alerts = [] } = dashboard;

    return (
        <Container fluid px="xl">
            <AggregatedVaultBanner
                isAggregated={isAggregated}
                onlineCount={onlineCount}
                totalVaultsCount={totalVaultsCount}
                offlineVaults={offlineVaults}
                partialErrors={partialErrors}
            />

            <Stack gap="xl">
                <Box>
                    <Title order={1} mb={rem(4)}>📊 Dashboard</Title>
                    <Text c="dimmed">Welcome to your Wallpaper Vault. Here's a snapshot of your collection.</Text>
                </Box>

                {/* 1. Health Alerts (Priority) */}
                {alerts.length > 0 && (
                    <Stack gap="sm">
                        <Title order={3} size="h4">Library Health</Title>
                        {alerts.map((alert) => (
                            <Alert 
                                key={alert.id}
                                variant="light" 
                                color={alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'orange' : 'blue'}
                                title={`${alert.message} (${alert.count})`}
                                icon={alert.severity === 'critical' ? <IconAlertCircle size="1rem" /> : alert.severity === 'warning' ? <IconExclamationMark size="1rem" /> : <IconInfoCircle size="1rem" />}
                                styles={{ title: { fontWeight: 600 } }}
                            >
                                <Group justify="space-between" align="center">
                                    <Text size="sm">These items might need your attention to maintain library integrity.</Text>
                                    <Button 
                                        variant="subtle" 
                                        size="xs" 
                                        rightSection={<IconArrowRight size="1rem" />}
                                        onClick={() => navigate(alert.link)}
                                    >
                                        Resolve
                                    </Button>
                                </Group>
                            </Alert>
                        ))}
                    </Stack>
                )}

                {/* 2. Library Vitals */}
                <DashboardStatsGrid stats={stats} />

                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
                    <Stack gap="md">
                        <Title order={3} size="h4">Aspect Ratio Distribution</Title>
                        <Paper withBorder p="md" radius="md">
                            <Stack gap="xs">
                                {Object.keys(stats?.aspect_ratio_distribution || {}).length === 0 ? (
                                    <Text size="sm" c="dimmed" ta="center" py="md">No aspect ratio data available.</Text>
                                ) : (
                                    Object.entries(stats?.aspect_ratio_distribution || {}).map(([label, count]) => {
                                        const percentage = stats?.total_images ? (count / stats.total_images) * 100 : 0;
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

                        {/* Recent Imports */}
                        <RecentImportsSection
                            sets={recentSets}
                            loading={setsLoading}
                            isAggregated={isAggregated}
                            onSwitchVault={switchVault}
                        />

                        {/* 4. Set Taxonomy */}
                        <Stack gap="md" mt="md">
                            <Group justify="space-between" align="flex-end">
                                <Box>
                                    <Group gap="xs" mb={4}>
                                        <ThemeIcon color="violet" variant="light" size={28} radius="md">
                                            <IconFolders size="1rem" />
                                        </ThemeIcon>
                                        <Title order={3} size="h4">Set Taxonomy</Title>
                                    </Group>
                                    <Text size="xs" c="dimmed" ml="xl">
                                        Explore tags, characters, and franchises across your sets — click any to browse
                                    </Text>
                                </Box>
                            </Group>
                            <Paper withBorder p="md" radius="md">
                                <Tabs defaultValue="tags">
                                    <Tabs.List mb="md">
                                        <Tabs.Tab value="tags" leftSection={<IconTags size="1rem" />}>
                                            Tags ({setTagsOnly.length})
                                        </Tabs.Tab>
                                        <Tabs.Tab value="characters" leftSection={<IconUser size="1rem" />}>
                                            Characters ({characterSetCloud.length})
                                        </Tabs.Tab>
                                        <Tabs.Tab value="franchises" leftSection={<IconFolders size="1rem" />}>
                                            Franchises ({franchiseSetCloud.length})
                                        </Tabs.Tab>
                                    </Tabs.List>

                                    <Tabs.Panel value="tags">
                                        <TagCloud 
                                            tags={setTagsOnly} 
                                            height={300} 
                                            emptyMessage="No set tags yet — start tagging your sets!"
                                        />
                                    </Tabs.Panel>

                                    <Tabs.Panel value="characters">
                                        <TagCloud 
                                            tags={characterSetCloud} 
                                            height={300} 
                                            emptyMessage="No characters yet — start adding characters to your sets!"
                                        />
                                    </Tabs.Panel>

                                    <Tabs.Panel value="franchises">
                                        <TagCloud 
                                            tags={franchiseSetCloud} 
                                            height={300} 
                                            emptyMessage="No franchises yet — start adding franchises to your sets!"
                                        />
                                    </Tabs.Panel>
                                </Tabs>
                            </Paper>
                        </Stack>
                    </Stack>

                    <Stack gap="md">
                        {/* Random Inspiration */}
                        <RandomInspirationCard
                            randomImage={randomImage}
                            isFetching={isFetchingInspiration}
                            isAggregated={isAggregated}
                            onRefresh={() => refetchInspiration()}
                            onSwitchVault={switchVault}
                        />

                        {/* 5. Image Taxonomy */}
                        <Stack gap="md" mt="md">
                            <Group justify="space-between" align="flex-end">
                                <Box>
                                    <Group gap="xs" mb={4}>
                                        <ThemeIcon color="teal" variant="light" size={28} radius="md">
                                            <IconPhoto size="1rem" />
                                        </ThemeIcon>
                                        <Title order={3} size="h4">Image Taxonomy</Title>
                                    </Group>
                                    <Text size="xs" c="dimmed" ml="xl">
                                        Explore tags, characters, and franchises across individual wallpapers — click any to browse
                                    </Text>
                                </Box>
                            </Group>
                            <Paper withBorder p="md" radius="md">
                                <Tabs defaultValue="tags">
                                    <Tabs.List mb="md">
                                        <Tabs.Tab value="tags" leftSection={<IconTags size="1rem" />}>
                                            Tags ({imageTagsOnly.length})
                                        </Tabs.Tab>
                                        <Tabs.Tab value="characters" leftSection={<IconUser size="1rem" />}>
                                            Characters ({characterImageCloud.length})
                                        </Tabs.Tab>
                                        <Tabs.Tab value="franchises" leftSection={<IconFolders size="1rem" />}>
                                            Franchises ({franchiseImageCloud.length})
                                        </Tabs.Tab>
                                    </Tabs.List>

                                    <Tabs.Panel value="tags">
                                        <TagCloud 
                                            tags={imageTagsOnly} 
                                            height={300} 
                                            emptyMessage="No image tags yet — start tagging individual images!"
                                        />
                                    </Tabs.Panel>

                                    <Tabs.Panel value="characters">
                                        <TagCloud 
                                            tags={characterImageCloud} 
                                            height={300} 
                                            emptyMessage="No image characters yet — start adding characters to your images!"
                                        />
                                    </Tabs.Panel>

                                    <Tabs.Panel value="franchises">
                                        <TagCloud 
                                            tags={franchiseImageCloud} 
                                            height={300} 
                                            emptyMessage="No image franchises yet — start adding franchises to your images!"
                                        />
                                    </Tabs.Panel>
                                </Tabs>
                            </Paper>
                        </Stack>
                    </Stack>
                </SimpleGrid>
            </Stack>
        </Container>
    );
}
