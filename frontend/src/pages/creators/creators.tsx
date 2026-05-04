import { Title, Text, Container, Table, Group, Avatar, Loader, Center, Alert, ActionIcon, TextInput, Select, Stack, Button, Modal } from '@mantine/core';
import { IconAlertCircle, IconChevronRight, IconSearch, IconFilter, IconGitMerge } from '@tabler/icons-react';
import { useReadCreatorsApiCreatorsGet, useMergeCreatorsApiCreatorsMergePost } from '../../api/generated/creators/creators';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { notifications } from '@mantine/notifications';

export default function Creators() {
    const navigate = useNavigate();
    const { data: creators, isLoading, error, refetch } = useReadCreatorsApiCreatorsGet();
    const mergeMutation = useMergeCreatorsApiCreatorsMergePost();

    // Filter State
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string | null>(null);

    // Merge Modal State
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    const [sourceCreatorId, setSourceCreatorId] = useState<string | null>(null);
    const [targetCreatorId, setTargetCreatorId] = useState<string | null>(null);

    const filteredCreators = useMemo(() => {
        if (!creators) return [];
        return creators.filter(creator => {
            const matchesSearch = !search || 
                creator.canonical_name.toLowerCase().includes(search.toLowerCase());
            
            const matchesType = !typeFilter || 
                creator.type === typeFilter;

            return matchesSearch && matchesType;
        });
    }, [creators, search, typeFilter]);

    const handleMerge = async () => {
        if (!sourceCreatorId || !targetCreatorId) return;
        try {
            await mergeMutation.mutateAsync({ 
                data: { 
                    source_id: Number(sourceCreatorId), 
                    target_id: Number(targetCreatorId) 
                } 
            });
            notifications.show({ title: 'Success', message: 'Creators merged successfully', color: 'green' });
            setIsMergeModalOpen(false);
            setSourceCreatorId(null);
            setTargetCreatorId(null);
            refetch();
        } catch {
            notifications.show({ title: 'Error', message: 'Could not merge creators', color: 'red' });
        }
    };

    const creatorOptions = creators?.map(c => ({
        value: String(c.id),
        label: c.canonical_name
    })) || [];

    if (isLoading) {
        return (
            <Center h={400}>
                <Loader size="xl" />
            </Center>
        );
    }

    if (error) {
        return (
            <Container size="xl">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red">
                    Could not fetch creators from the backend. Make sure your FastAPI server is running!
                </Alert>
            </Container>
        );
    }

    const rows = filteredCreators.map((element) => (
        <Table.Tr 
            key={element.id} 
            onClick={() => navigate(`/creators/${element.id}`)}
            style={{ cursor: 'pointer' }}
        >
            <Table.Td>
                <Group gap="sm">
                    <Avatar size={30} radius={30} color="blue" />
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
                <Button 
                    variant="light" 
                    leftSection={<IconGitMerge size={16} />}
                    onClick={() => setIsMergeModalOpen(true)}
                >
                    Merge Artists
                </Button>
            </Group>
            <Text c="dimmed" mb="xl">Manage the talented people behind your favorite wallpapers.</Text>

            <Group mb="xl" grow align="flex-end">
                <TextInput
                    placeholder="Search by artist name..."
                    label="Search artists"
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
            
            {filteredCreators.length === 0 && (
                <Stack align="center" py={100} gap="md">
                    <Text size="xl" fw={500} c="dimmed">No artists match your filters</Text>
                    <Text c="dimmed">Try adjusting your search terms or clearing the filter.</Text>
                </Stack>
            )}

            {/* Merge Modal */}
            <Modal 
                opened={isMergeModalOpen} 
                onClose={() => setIsMergeModalOpen(false)} 
                title="Merge Artists"
                radius="md"
            >
                <Stack gap="md">
                    <Alert icon={<IconAlertCircle size="1rem" />} color="blue" variant="light">
                        Merging will move all wallpaper sets from the source to the target artist, and then delete the source artist.
                    </Alert>
                    
                    <Select 
                        label="Source Artist (To be deleted)"
                        placeholder="Select artist..."
                        data={creatorOptions}
                        searchable
                        value={sourceCreatorId}
                        onChange={setSourceCreatorId}
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
                    />

                    <Button 
                        fullWidth 
                        onClick={handleMerge} 
                        mt="md" 
                        color="blue"
                        disabled={!sourceCreatorId || !targetCreatorId || sourceCreatorId === targetCreatorId}
                    >
                        Execute Merge
                    </Button>
                </Stack>
            </Modal>
        </Container>
    );
}
