import { Title, Text, Container, Table, Group, Loader, Center, Alert, ActionIcon, TextInput, Select, Stack, Button, Modal, Pagination, Overlay, Box, MultiSelect } from '@mantine/core';
import { IconAlertCircle, IconChevronRight, IconSearch, IconFilter, IconGitMerge, IconPlus } from '@tabler/icons-react';
import { useReadCreatorsApiCreatorsGet, useMergeCreatorsApiCreatorsMergePost } from '../../api/generated/creators/creators';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { notifications } from '@mantine/notifications';
import { CreatorAvatar } from './components/CreatorAvatar';
import { CreatorCreateForm } from './components/CreatorCreateForm';
import { useDebouncedValue } from '@mantine/hooks';

const PAGE_SIZE = 12;

export default function Creators() {
    const navigate = useNavigate();
    
    // State
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string | null>(null);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [sourceCreatorIds, setSourceCreatorIds] = useState<string[]>([]);
    const [targetCreatorId, setTargetCreatorId] = useState<string | null>(null);

    // Debounce search to avoid API spam
    const [debouncedSearch] = useDebouncedValue(search, 300);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, typeFilter]);

    const { data: pageData, isLoading, isFetching, error, refetch } = useReadCreatorsApiCreatorsGet({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        creator_type: typeFilter || undefined
    });
    
    // Separate query to fetch ALL creators for the merge dropdowns (high limit)
    const { data: allCreatorsData } = useReadCreatorsApiCreatorsGet({
        skip: 0,
        limit: 1000,
        // No filters here so the user can search everything in the dropdown
    }, {
        query: {
            enabled: isMergeModalOpen // Only fetch when modal is open
        }
    });

    const creators = pageData?.items || [];
    const totalCount = pageData?.total || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const mergeMutation = useMergeCreatorsApiCreatorsMergePost();

    const creatorOptions = useMemo(() => {
        const list = allCreatorsData?.items || [];
        return list.map(c => ({
            value: String(c.id),
            label: c.canonical_name
        })).sort((a, b) => a.label.localeCompare(b.label));
    }, [allCreatorsData]);

    // Handlers
    const handleMerge = async () => {
        if (sourceCreatorIds.length === 0 || !targetCreatorId) return;
        try {
            await mergeMutation.mutateAsync({ 
                data: { 
                    source_ids: sourceCreatorIds.map(id => Number(id)), 
                    target_id: Number(targetCreatorId) 
                } 
            });
            notifications.show({ title: 'Success', message: 'Artists merged successfully', color: 'green' });
            setIsMergeModalOpen(false);
            setSourceCreatorIds([]);
            setTargetCreatorId(null);
            refetch();
        } catch {
            notifications.show({ title: 'Error', message: 'Could not merge artists', color: 'red' });
        }
    };

    const rows = creators.map((element) => (
        <Table.Tr 
            key={element.id} 
            onClick={() => navigate(`/creators/${element.id}`)}
            style={{ cursor: 'pointer' }}
        >
            <Table.Td>
                <Group gap="sm">
                    <CreatorAvatar imageId={element.stats?.preview_image_id} size={40} />
                    <Text size="sm" fw={500}>
                        {element.canonical_name}
                    </Text>
                </Group>
            </Table.Td>
            <Table.Td>{element.type || 'Artist'}</Table.Td>
            <Table.Td c="dimmed" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {element.notes || '-'}
            </Table.Td>
            <Table.Td>
                <Group justify="flex-end">
                    <ActionIcon variant="subtle" color="gray">
                        <IconChevronRight size={16} />
                    </ActionIcon>
                </Group>
            </Table.Td>
        </Table.Tr>
    ));

    return (
        <Container size="xl">
            <Group justify="space-between" mb="xs">
                <Title order={1}>🎨 Artists & Creators</Title>
                <Group>
                    <Button 
                        variant="light" 
                        leftSection={<IconGitMerge size={16} />}
                        onClick={() => setIsMergeModalOpen(true)}
                    >
                        Merge Artists
                    </Button>
                    <Button 
                        leftSection={<IconPlus size={16} />}
                        onClick={() => setIsCreateModalOpen(true)}
                    >
                        Create Artist
                    </Button>
                </Group>
            </Group>
            <Text c="dimmed" mb="xl">Manage the talented people behind your favorite wallpapers.</Text>

            <Group mb="xl" grow align="flex-end">
                <TextInput
                    placeholder="Search by artist name..."
                    label="Search all artists"
                    leftSection={<IconSearch size={16} />}
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                />
                <Select
                    label="Filter by type"
                    placeholder="All types"
                    leftSection={<IconFilter size={16} />}
                    data={['Artist', 'AI Generated', 'Studio', 'Photography']}
                    clearable
                    value={typeFilter}
                    onChange={setTypeFilter}
                />
            </Group>
            
            <Box style={{ position: 'relative', minHeight: 200 }}>
                {/* Initial Loading State */}
                {isLoading && !creators.length ? (
                    <Center py={100}><Loader size="xl" /></Center>
                ) : (
                    <>
                        {/* Fetching Overlay (for search/pagination) */}
                        {isFetching && (
                            <Overlay color="#fff" backgroundOpacity={0.5} blur={2} zIndex={10}>
                                <Center style={{ height: '100%' }}>
                                    <Loader size="lg" />
                                </Center>
                            </Overlay>
                        )}

                        {error ? (
                             <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red">
                                Could not fetch creators from the backend.
                            </Alert>
                        ) : (
                            <>
                                <Table.ScrollContainer minWidth={500}>
                                    <Table verticalSpacing="sm" highlightOnHover>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Name</Table.Th>
                                                <Table.Th>Type</Table.Th>
                                                <Table.Th>Notes</Table.Th>
                                                <Table.Th />
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>{rows}</Table.Tbody>
                                    </Table>
                                </Table.ScrollContainer>
                                
                                {creators.length === 0 && !isFetching && (
                                    <Stack align="center" py={100} gap="md">
                                        <Text size="xl" fw={500} c="dimmed">No artists match your filters</Text>
                                        <Text c="dimmed">Try adjusting your search terms or clearing the filter.</Text>
                                    </Stack>
                                )}
                            </>
                        )}
                    </>
                )}
            </Box>

            {totalPages > 1 && (
                <Center mt="xl" pb="xl">
                    <Pagination total={totalPages} value={page} onChange={setPage} withEdges />
                </Center>
            )}

            {/* Create Modal */}
            <Modal 
                opened={isCreateModalOpen} 
                onClose={() => setIsCreateModalOpen(false)} 
                title="Add New Artist"
                radius="md"
            >
                <CreatorCreateForm 
                    onSuccess={() => {
                        setIsCreateModalOpen(false);
                        refetch();
                    }} 
                />
            </Modal>

            {/* Merge Modal */}
            <Modal 
                opened={isMergeModalOpen} 
                onClose={() => setIsMergeModalOpen(false)} 
                title="Merge Artists"
                radius="md"
                size="lg"
            >
                <Stack gap="md">
                    <Alert icon={<IconAlertCircle size="1rem" />} color="blue" variant="light">
                        Merging will move all wallpaper sets from the source artists to the target artist, and then delete the source artists.
                    </Alert>
                    
                    <MultiSelect 
                        label="Source Artists (To be deleted)"
                        placeholder="Select one or more artists..."
                        data={creatorOptions}
                        searchable
                        value={sourceCreatorIds}
                        onChange={setSourceCreatorIds}
                        nothingFoundMessage="No artists found"
                        clearable
                        error={targetCreatorId && sourceCreatorIds.includes(targetCreatorId) ? "You cannot delete the target artist you are merging into." : undefined}
                    />

                    <Center>
                        <IconGitMerge size={24} color="gray" />
                    </Center>

                    <Select 
                        label="Target Artist (The survivor)"
                        placeholder="Select artist..."
                        data={creatorOptions}
                        searchable
                        value={targetCreatorId}
                        onChange={setTargetCreatorId}
                        nothingFoundMessage="No artists found"
                        error={targetCreatorId && sourceCreatorIds.includes(targetCreatorId) ? "Target artist cannot be in the list of artists to be deleted." : undefined}
                    />

                    <Button 
                        fullWidth 
                        onClick={handleMerge} 
                        mt="md" 
                        color="blue"
                        disabled={sourceCreatorIds.length === 0 || !targetCreatorId || sourceCreatorIds.includes(targetCreatorId)}
                    >
                        Execute Bulk Merge
                    </Button>
                </Stack>
            </Modal>
        </Container>
    );
}
