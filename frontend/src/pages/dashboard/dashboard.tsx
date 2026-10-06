/**
 * @file
 * Module: Dashboard Page
 * Description: The main landing page displaying library statistics, recent imports, random inspiration, and system health alerts.
 */
import { 
    Title, 
    Text, 
    Container, 
    SimpleGrid, 
    Stack, 
    Alert, 
    Loader,
    Center,
    rem,
    Box
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useVault } from '../../hooks/useVault';
import { AggregatedVaultBanner } from '../../components/vault/AggregatedVaultBanner';
import { DashboardStatsGrid } from './DashboardStatsGrid';
import { RecentImportsSection } from './RecentImportsSection';
import { RandomInspirationCard } from './RandomInspirationCard';
import { useDashboardData } from './hooks/useDashboardData';
import { DashboardHealthAlerts } from './components/DashboardHealthAlerts';
import { AspectRatioCard } from './components/AspectRatioCard';
import { TaxonomyCloudPanel } from './components/TaxonomyCloudPanel';

const LOADER_CENTER_HEIGHT = 400;

export default function Dashboard() {
    const navigate = useNavigate();
    const { switchVault } = useVault();
    
    const {
        dashboard,
        statsLoading,
        statsError,
        isAggregated,
        onlineCount,
        totalVaultsCount,
        offlineVaults,
        partialErrors,
        recentSets,
        setsLoading,
        randomImage,
        refetchInspiration,
        isFetchingInspiration,
        setTagsOnly,
        imageTagsOnly,
        characterSetCloud,
        characterImageCloud,
        franchiseSetCloud,
        franchiseImageCloud,
    } = useDashboardData();

    if (statsLoading) {
        return (
            <Center h={LOADER_CENTER_HEIGHT}>
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
                <DashboardHealthAlerts 
                    alerts={alerts} 
                    onResolve={(link) => navigate(link)} 
                />

                {/* 2. Library Vitals */}
                <DashboardStatsGrid stats={stats} />

                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
                    <Stack gap="md">
                        {/* Aspect Ratio Distribution */}
                        <AspectRatioCard 
                            distribution={stats?.aspect_ratio_distribution} 
                            totalImages={stats?.total_images} 
                        />

                        {/* Recent Imports */}
                        <RecentImportsSection
                            sets={recentSets}
                            loading={setsLoading}
                            isAggregated={isAggregated}
                            onSwitchVault={switchVault}
                        />

                        {/* Set Taxonomy */}
                        <TaxonomyCloudPanel
                            scope="sets"
                            tags={setTagsOnly}
                            characters={characterSetCloud}
                            franchises={franchiseSetCloud}
                        />
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

                        {/* Image Taxonomy */}
                        <TaxonomyCloudPanel
                            scope="images"
                            tags={imageTagsOnly}
                            characters={characterImageCloud}
                            franchises={franchiseImageCloud}
                        />
                    </Stack>
                </SimpleGrid>
            </Stack>
        </Container>
    );
}
