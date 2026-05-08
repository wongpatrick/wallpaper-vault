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
    Box
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
    IconArrowRight
} from '@tabler/icons-react';
import { useReadDashboardDataApiDashboardGet } from '../../api/generated/dashboard/dashboard';
import { useReadSetsApiSetsGet } from '../../api/generated/sets/sets';
import { useReadRandomImageApiImagesRandomGet } from '../../api/generated/images/images';
import { formatBytes, getImageUrl } from '../../utils/fileUtils';
import { Link, useNavigate } from 'react-router-dom';

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

    if (statsLoading) {
        return (
            <Center style={{ height: '50vh' }}>
                <Loader size="xl" />
            </Center>
        );
    }

    if (statsError) {
        return (
            <Container size="xl">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error" color="red">
                    Failed to load dashboard data. Please ensure the backend is running.
                </Alert>
            </Container>
        );
    }

    const stats = dashboard?.stats;
    const alerts = dashboard?.health_alerts || [];

    return (
        <Container size="xl" py="md">
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
                <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
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
                </SimpleGrid>

                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
                    <Stack gap="md">
                        <Title order={3} size="h4">Aspect Ratio Distribution</Title>
                        <Paper withBorder p="md" radius="md">
                            <Stack gap="xs">
                                {Object.entries(stats?.aspect_ratio_distribution || {}).map(([label, count]) => {
                                    const percentage = stats?.total_images ? (count / stats.total_images) * 100 : 0;
                                    return (
                                        <Box key={label}>
                                            <Group justify="space-between" mb={2}>
                                                <Text size="sm" fw={500}>{label}</Text>
                                                <Text size="xs" c="dimmed">{count} images ({percentage.toFixed(1)}%)</Text>
                                            </Group>
                                            <div style={{ height: 8, borderRadius: 4, backgroundColor: 'var(--mantine-color-gray-2)', overflow: 'hidden' }}>
                                                <div style={{ 
                                                    height: '100%', 
                                                    width: `${percentage}%`, 
                                                    backgroundColor: getARColor(label),
                                                    transition: 'width 0.5s ease'
                                                }} />
                                            </div>
                                        </Box>
                                    );
                                })}
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
                                                    src={getImageUrl(set.images?.[0]?.id)} 
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
                    </Stack>

                    <Stack gap="md">
                        <Title order={3} size="h4">Inspiration</Title>
                        {randomImage ? (
                            <Card withBorder radius="md" p={0}>
                                <Card.Section>
                                    <Image 
                                        src={getImageUrl(randomImage.id)} 
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
