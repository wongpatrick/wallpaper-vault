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
    Progress
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
    IconTags
} from '@tabler/icons-react';
import { useReadDashboardDataApiDashboardGet } from '../../api/generated/dashboard/dashboard';
import { useReadSetsApiSetsGet } from '../../api/generated/sets/sets';
import { useReadRandomImageApiImagesRandomGet } from '../../api/generated/images/images';
import { useReadTagCloudApiTagsCloudGet } from '../../api/generated/tags/tags';
import { useReadCharactersApiCharactersGet } from '../../api/generated/characters/characters';
import { useReadFranchisesApiFranchisesGet } from '../../api/generated/franchises/franchises';
import { formatBytes, getImageUrl } from '../../utils/fileUtils';
import { Link, useNavigate } from 'react-router-dom';
import TagCloud from '../../components/ui/TagCloud';

export default function Dashboard() {
    const navigate = useNavigate();
    
    // 1. Fetch Dashboard Stats
    const { data: dashboard, isLoading: statsLoading, error: statsError } = useReadDashboardDataApiDashboardGet();
    
    // 2. Fetch Recent Sets
    const { data: recentSets, isLoading: setsLoading } = useReadSetsApiSetsGet({
        limit: 5
    });

    // 3. Fetch Random Inspiration
    const { data: randomImage } = useReadRandomImageApiImagesRandomGet();

    // 4. Fetch Tag Cloud
    const { data: tagCloud } = useReadTagCloudApiTagsCloudGet({ limit: 50 });

    // 5. Fetch Characters
    const { data: characters } = useReadCharactersApiCharactersGet({ limit: 50 });

    // 6. Fetch Franchises
    const { data: franchises } = useReadFranchisesApiFranchisesGet({ limit: 50 });

    // 7. Transform characters data into TagCloudItem shape
    const characterCloud = useMemo(() => {
        if (!characters) return [];
        return characters
            .filter((c) => (c.set_count ?? 0) > 0)
            .map((c) => ({
                tag: c.name,
                type: 'character',
                count: c.set_count ?? 0,
            }))
            .sort((a, b) => b.count - a.count);
    }, [characters]);

    // 8. Transform franchises data into TagCloudItem shape
    const franchiseCloud = useMemo(() => {
        if (!franchises) return [];
        return franchises
            .filter((f) => (f.set_count ?? 0) > 0)
            .map((f) => ({
                tag: f.name,
                type: 'franchise',
                count: f.set_count ?? 0,
            }))
            .sort((a, b) => b.count - a.count);
    }, [franchises]);

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
                                recentSets?.items?.map((set) => (
                                    <Paper key={set.id} withBorder p="xs" radius="md" component={Link} to={`/sets/${set.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                        <Group justify="space-between" wrap="nowrap">
                                            <Group wrap="nowrap">
                                                <Image 
                                                    src={set.images?.[0]?.id ? getImageUrl(set.images[0].id, set.images[0].phash || set.images[0].file_size || undefined) : null} 
                                                    w={40} 
                                                    h={40} 
                                                    radius="sm" 
                                                    fallbackSrc="https://placehold.co/40x40?text=Set"
                                                />
                                                <Box>
                                                    <Text size="sm" fw={600} truncate="end" maw={250}>{set.title}</Text>
                                                    <Text size="xs" c="dimmed">{set.creators?.[0]?.canonical_name || 'Unknown'}</Text>
                                                </Box>
                                            </Group>
                                            <Badge variant="light" size="xs">{set.images?.length || 0} images</Badge>
                                        </Group>
                                    </Paper>
                                ))
                            )}
                        </Stack>

                        {/* 4. Taxonomy Landscape */}
                        <Stack gap="md" mt="md">
                            <Group justify="space-between" align="flex-end">
                                <Box>
                                    <Group gap="xs" mb={4}>
                                        <ThemeIcon color="violet" variant="light" size={28} radius="md">
                                            <IconTags size="1rem" />
                                        </ThemeIcon>
                                        <Title order={3} size="h4">Taxonomy Landscape</Title>
                                    </Group>
                                    <Text size="xs" c="dimmed" ml="xl">
                                        Explore tags, characters, and franchises across your collection — click any to browse
                                    </Text>
                                </Box>
                            </Group>
                            <Paper withBorder p="md" radius="md">
                                <Tabs defaultValue="tags">
                                    <Tabs.List mb="md">
                                        <Tabs.Tab value="tags" leftSection={<IconTags size="1rem" />}>
                                            Tags ({tagCloud?.length || 0})
                                        </Tabs.Tab>
                                        <Tabs.Tab value="characters" leftSection={<IconUser size="1rem" />}>
                                            Characters ({characterCloud.length})
                                        </Tabs.Tab>
                                        <Tabs.Tab value="franchises" leftSection={<IconFolders size="1rem" />}>
                                            Franchises ({franchiseCloud.length})
                                        </Tabs.Tab>
                                    </Tabs.List>

                                    <Tabs.Panel value="tags">
                                        <TagCloud 
                                            tags={tagCloud || []} 
                                            height={300} 
                                            emptyMessage="No tags yet — start tagging your sets!"
                                        />
                                    </Tabs.Panel>

                                    <Tabs.Panel value="characters">
                                        <TagCloud 
                                            tags={characterCloud} 
                                            height={300} 
                                            emptyMessage="No characters yet — start adding characters to your sets!"
                                        />
                                    </Tabs.Panel>

                                    <Tabs.Panel value="franchises">
                                        <TagCloud 
                                            tags={franchiseCloud} 
                                            height={300} 
                                            emptyMessage="No franchises yet — start adding franchises to your sets!"
                                        />
                                    </Tabs.Panel>
                                </Tabs>
                            </Paper>
                        </Stack>
                    </Stack>

                    <Stack gap="md">
                        <Title order={3} size="h4">Inspiration</Title>
                        {randomImage ? (
                            <Card withBorder radius="md" p={0}>
                                <Card.Section>
                                    <Image 
                                        src={getImageUrl(randomImage.id, randomImage.phash || randomImage.file_size || undefined)} 
                                        fallbackSrc="https://placehold.co/600x400?text=No+Preview"
                                        alt="Random inspiration"
                                    />
                                </Card.Section>
                                <Stack p="md" gap="xs">
                                    <Group justify="space-between">
                                        <Text fw={600} truncate="end" maw={200}>{randomImage.filename}</Text>
                                        <Badge color={getARColor(randomImage.aspect_ratio_label || '')}>
                                            {randomImage.aspect_ratio_label}
                                        </Badge>
                                    </Group>
                                    <Button 
                                        component={Link} 
                                        to={`/sets/${randomImage.set_id}`} 
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
