/**
 * @file
 * Module: Creator Detail Page
 * Description: Displays detailed information about a specific creator, including their wallpaper sets, statistics, and provides functionality to edit or delete their profile.
 */
import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSelection } from '../../hooks/useSelection';
import { 
    Title, Text, Container, SimpleGrid, Group, Loader, 
    Center, Alert, Stack, Button
} from '@mantine/core';
import { IconAlertCircle, IconArrowLeft, IconCheck } from '@tabler/icons-react';
import { useReadCreatorApiCreatorsCreatorIdGet } from '../../api/generated/creators/creators';
import { SetCard } from '../../components/sets/SetCard';
import { SetBulkOperations } from '../../components/sets/SetBulkOperations';
import type { Set as SetModel, CreatorWithSets } from '../../api/model';
import { CreatorStatsCard } from './CreatorStatsCard';
import { useCreatorSetsFilter } from './hooks/useCreatorSetsFilter';
import { useCreatorMutations } from './hooks/useCreatorMutations';
import { CreatorSetsFilterBar } from './components/CreatorSetsFilterBar';
import { CreatorProfileHeader } from './components/CreatorProfileHeader';
import { CreatorDetailModals } from './components/CreatorDetailModals';

export default function CreatorDetail() {
    const { creatorId } = useParams<{ creatorId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    
    // We must pass enabled: !isNaN(Number(creatorId)) because the Orval generated hook defaults to enabled: !!creatorId, which disables the query for ID 0.
    const { data: creatorData, isLoading, error, refetch } = useReadCreatorApiCreatorsCreatorIdGet(
        Number(creatorId),
        undefined,
        { query: { enabled: !isNaN(Number(creatorId)) } }
    );
    const creator = creatorData as CreatorWithSets | undefined;
    
    const [createModalOpened, setCreateModalOpened] = useState(false);

    // Mutations, modals, and action workflows
    const mutations = useCreatorMutations(creatorId, creator, refetch);

    // Filtering, sorting and derived set items
    const {
        searchQuery,
        setSearchQuery,
        orientationFilter,
        setOrientationFilter,
        sortBy,
        setSortBy,
        processedSets
    } = useCreatorSetsFilter(creator?.sets);

    // Selection management for bulk operations
    const {
        selectionMode,
        setSelectionMode,
        selectedIds,
        toggle: toggleSelect,
        clear: clearSelection,
        startSelectionWith
    } = useSelection<number>();

    const selectedSets = useMemo(
        () => (creator?.sets || []).filter(s => selectedIds.has(s.id)),
        [creator?.sets, selectedIds]
    );

    const handleLongPress = useCallback((id: number) => {
        if (!selectionMode) {
            startSelectionWith(id);
        }
    }, [selectionMode, startSelectionWith]);

    if (isLoading) return <Center h={400}><Loader size="xl" /></Center>;

    if (error || !creator) {
        return (
            <Container fluid px="xl">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red">
                    Could not fetch creator details.
                </Alert>
                <Button 
                    variant="subtle" 
                    leftSection={<IconArrowLeft size={16} />} 
                    onClick={() => {
                        if (location.state?.from) {
                            navigate(-1);
                        } else {
                            navigate('/creators');
                        }
                    }} 
                    mt="md"
                >
                    Back to {location.state?.fromLabel || "Creators"}
                </Button>
            </Container>
        );
    }

    return (
        <Container fluid px="xl" pb={selectionMode ? 100 : "xl"}>
            <Button 
                variant="subtle" 
                leftSection={<IconArrowLeft size={16} />} 
                onClick={() => {
                    if (location.state?.from) {
                        navigate(-1);
                    } else {
                        navigate('/creators');
                    }
                }} 
                mb="lg"
                color="gray"
            >
                Back to {location.state?.fromLabel || "Creators"}
            </Button>

            {/* Profile Header */}
            <CreatorProfileHeader 
                creator={creator} 
                onEdit={() => mutations.setIsEditModalOpen(true)} 
                onDelete={() => mutations.setIsDeleteModalOpen(true)} 
            />

            {/* Stats Grid */}
            <CreatorStatsCard stats={creator.stats} />

            {/* Creator's Sets */}
            <Group justify="space-between" align="center" mb="lg">
                <Title order={2}>Collection by {creator.canonical_name}</Title>
                <Group gap="sm">
                    <Button
                        variant="filled"
                        color="blue"
                        onClick={() => setCreateModalOpened(true)}
                    >
                        Create Set
                    </Button>
                    <Button 
                        variant={selectionMode ? "filled" : "light"} 
                        color={selectionMode ? "blue" : "gray"}
                        leftSection={selectionMode ? <IconCheck size={16} /> : null}
                        onClick={() => selectionMode ? clearSelection() : setSelectionMode(true)}
                    >
                        {selectionMode ? "Finish Selecting" : "Select Items"}
                    </Button>
                </Group>
            </Group>
            
            {creator.sets && creator.sets.length > 0 ? (
                <>
                    <CreatorSetsFilterBar 
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        orientationFilter={orientationFilter}
                        onOrientationChange={setOrientationFilter}
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                    />

                    {processedSets.length > 0 ? (
                        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
                            {processedSets.map((set: SetModel) => (
                                <SetCard 
                                    key={set.id} 
                                    set={set} 
                                    onDelete={mutations.handleDeleteSet} 
                                    selectionMode={selectionMode}
                                    selected={selectedIds.has(set.id)}
                                    onToggleSelect={toggleSelect}
                                    onLongPress={handleLongPress}
                                />
                            ))}
                        </SimpleGrid>
                    ) : (
                        <Stack align="center" py={100} gap="md">
                            <Text size="xl" fw={500} c="dimmed">No sets match your filters</Text>
                            <Text c="dimmed">Try adjusting your search terms or clearing the orientation filter.</Text>
                        </Stack>
                    )}
                </>
            ) : (
                <Center py={100}>
                    <Text c="dimmed">This creator has no wallpaper sets yet.</Text>
                </Center>
            )}

            <SetBulkOperations 
                selectedIds={selectedIds}
                clearSelection={clearSelection}
                selectionMode={selectionMode}
                refetch={refetch}
                selectedSets={selectedSets}
            />

            <CreatorDetailModals 
                creator={creator}
                mutations={mutations}
                createModalOpened={createModalOpened}
                setCreateModalOpened={setCreateModalOpened}
                refetch={refetch}
            />
        </Container>
    );
}
