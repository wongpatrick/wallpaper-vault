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
    Badge,
    rem,
    Card,
    Image,
    Box,
    Tabs,
    Progress,
    ActionIcon,
    Tooltip
} from '@mantine/core';
import { 
    IconAlertCircle, 
    IconExclamationMark, 
    IconInfoCircle, 
    IconPhoto, 
    IconUser, 
    IconFolders, 
    IconDatabase,
    IconExternalLink,
    IconArrowRight,
    IconTags,
    IconRefresh
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
import { formatBytes, getImageUrl, getThumbnailUrl } from '../../utils/fileUtils';
import { useNavigate, useLocation } from 'react-router-dom';
import TagCloud from '../../components/ui/TagCloud';

import type { WithMultiVault } from '../../types/vault';
import type { SetSummary, Image as ImageModel } from '../../api/model';


const INSPIRATION_ROTATION_INTERVAL_MS = 20000;

export default function Dashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const { switchVault } = useVault();
    
    // 1. Fetch Dashboard Stats
    const { 
        data: dashboard, 
        isLoading: statsLoading, 
        error: statsError,
        isAggregated,
        onlineCount,
        totalVaultsCount,
        offlineVaults
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
        if (!setCharacters?.items) return [];
        return setCharacters.items
            .filter((c) => (c.set_count ?? 0) > 0)
            .map((c) => ({
                tag: c.name,
                type: 'character',
                count: c.set_count ?? 0,
            }))
            .sort((a, b) => b.count - a.count);
    }, [setCharacters]);

    const characterImageCloud = useMemo(() => {
        if (!imageCharacters?.items) return [];
        return imageCharacters.items
            .filter((c) => (c.image_count ?? 0) > 0)
            .map((c) => ({
                tag: c.name,
                type: 'character',
                count: c.image_count ?? 0,
            }))
            .sort((a, b) => b.count - a.count);
    }, [imageCharacters]);

    // 9. Transform franchises data into TagCloudItem shapes
    const franchiseSetCloud = useMemo(() => {
        if (!setFranchises?.items) return [];
        return setFranchises.items
            .filter((f) => (f.set_count ?? 0) > 0)
            .map((f) => ({
                tag: f.name,
                type: 'franchise',
                count: f.set_count ?? 0,
            }))
            .sort((a, b) => b.count - a.count);
    }, [setFranchises]);

    const franchiseImageCloud = useMemo(() => {
        if (!imageFranchises?.items) return [];
        return imageFranchises.items
            .filter((f) => (f.image_count ?? 0) > 0)
            .map((f) => ({
                tag: f.name,
                type: 'franchise',
                count: f.image_count ?? 0,
            }))
            .sort((a, b) => b.count - a.count);
    }, [imageFranchises]);


    if (statsLoading) {
        return (
            <Center style={{ height: '50vh' }}>
                <Loader size="xl" />
            </Center>
        );
    }

    if (statsError) {
        return (
            <Container fluid px="xl">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error" color="red">
                    Failed to load dashboard data. Please ensure the backend is running.
                </Alert>
            </Container>
        );
    }

    const stats = dashboard?.stats;
    const alerts = dashboard?.health_alerts || [];

    return (
        <Container fluid px="xl" py="md">
            <AggregatedVaultBanner
                isAggregated={isAggregated}
                onlineCount={onlineCount}
                totalVaultsCount={totalVaultsCount}
                offlineVaults={offlineVaults}
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

                        <Stack gap="xs" mt="md">
                            <Title order={3} size="h4">Recent Imports</Title>
                            {setsLoading ? (
                                <Center py="xl"><Loader variant="dots" /></Center>
                            ) : recentSets?.items?.length === 0 ? (
                                <Text size="sm" c="dimmed">No sets imported yet.</Text>
                            ) : (
                                recentSets?.items?.map((set) => {
                                    const multiSet = set as WithMultiVault<SetSummary>;
                                    const coverUrl = set.preview_image_id 
                                        ? getThumbnailUrl(set.preview_image_id, 'sm', undefined, multiSet._vaultUrl, multiSet._vaultApiKey)
                                        : null;
                                    return (
                                        <Paper 
                                            key={`${multiSet._vaultId || 'local'}-${set.id}`} 
                                            withBorder 
                                            p="xs" 
                                            radius="md" 
                                            onClick={async (e) => {
                                                e.preventDefault();
                                                if (isAggregated && multiSet._vaultId) {
                                                    await switchVault(multiSet._vaultId);
                                                }
                                                navigate(`/sets/${set.id}`, { state: { from: location.pathname, fromLabel: 'Dashboard' } });
                                            }}
                                            style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                                        >
                                            <Group justify="space-between" wrap="nowrap">
                                                <Group wrap="nowrap">
                                                    <Image 
                                                        src={coverUrl} 
                                                        w={40} 
                                                        h={40} 
                                                        radius="sm" 
                                                        fallbackSrc="https://placehold.co/40x40?text=Set"
                                                    />
                                                    <Box>
                                                        <Group gap={6} wrap="nowrap">
                                                            <Text size="sm" fw={600} truncate="end" maw={220}>{set.title}</Text>
                                                            {isAggregated && multiSet._vaultLabel && (
                                                                <Badge size="xs" variant="dot" color="teal">
                                                                    {multiSet._vaultLabel}
                                                                </Badge>
                                                            )}
                                                        </Group>
                                                        <Text size="xs" c="dimmed">{set.creators?.[0]?.canonical_name || 'Unknown'}</Text>
                                                    </Box>
                                                </Group>
                                                <Badge variant="light" size="xs">{set.image_count ?? 0} images</Badge>
                                            </Group>
                                        </Paper>
                                    );
                                })
                            )}
                        </Stack>

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
                        <Group justify="space-between" align="center">
                            <Title order={3} size="h4">Inspiration</Title>
                            <Tooltip label="Shuffle inspiration">
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                    onClick={() => refetchInspiration()}
                                    loading={isFetchingInspiration}
                                >
                                    <IconRefresh size={16} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                        {randomImage ? (
                            <Card withBorder radius="md" p={0}>
                                <Card.Section>
                                    <Image 
                                        src={getImageUrl(randomImage.id, randomImage.phash || randomImage.file_size || undefined, (randomImage as WithMultiVault<ImageModel>)._vaultUrl, (randomImage as WithMultiVault<ImageModel>)._vaultApiKey)} 
                                        fallbackSrc="https://placehold.co/600x400?text=No+Preview"
                                        alt="Random inspiration"
                                    />
                                </Card.Section>
                                <Stack p="md" gap="xs">
                                    <Group justify="space-between">
                                        <Text fw={600} truncate="end" maw={200}>{randomImage.filename}</Text>
                                        <Group gap="xs">
                                            {isAggregated && (randomImage as WithMultiVault<ImageModel>)._vaultLabel && (
                                                <Badge size="xs" variant="dot" color="teal">
                                                    {(randomImage as WithMultiVault<ImageModel>)._vaultLabel}
                                                </Badge>
                                            )}
                                            <Badge color={getARColor(randomImage.aspect_ratio_label || '')}>
                                                {randomImage.aspect_ratio_label}
                                            </Badge>
                                        </Group>
                                    </Group>
                                    <Button 
                                        onClick={async () => {
                                            if (isAggregated && (randomImage as WithMultiVault<ImageModel>)._vaultId) {
                                                await switchVault((randomImage as WithMultiVault<ImageModel>)._vaultId!);
                                            }
                                            navigate(`/sets/${randomImage.set_id}`, { state: { from: location.pathname, fromLabel: 'Dashboard' } });
                                        }}
                                        variant="light" 
                                        fullWidth 
                                        leftSection={<IconExternalLink size="1rem" />}
                                    >
                                        View Set
                                    </Button>
                                </Stack>
                            </Card>
                        ) : (
                            <Paper withBorder p="xl" radius="md">
                                <Center h={200}>
                                    <Text c="dimmed">Add some wallpapers to see inspiration!</Text>
                                </Center>
                            </Paper>
                        )}


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

function StatsCard({ title, value, icon, color }: { title: string, value: string | number, icon: React.ReactNode, color: string }) {
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

function getARColor(label: string) {
    const l = label.toLowerCase();
    if (l.includes('16/9') || l.includes('16x9')) return 'var(--mantine-color-blue-6)';
    if (l.includes('21/9') || l.includes('21x9')) return 'var(--mantine-color-teal-6)';
    if (l.includes('9/16') || l.includes('9x16')) return 'var(--mantine-color-orange-6)';
    if (l.includes('16/10') || l.includes('16x10')) return 'var(--mantine-color-indigo-6)';
    return 'var(--mantine-color-gray-6)';
}
