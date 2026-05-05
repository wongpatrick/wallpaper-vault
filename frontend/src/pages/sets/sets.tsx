import { Title, Text, Container, SimpleGrid, Loader, Center, Alert, Stack, TextInput, Group, Select, Pagination } from '@mantine/core';
import { IconAlertCircle, IconSearch, IconFilter } from '@tabler/icons-react';
import { useReadSetsApiSetsGet, useDeleteSetApiSetsSetIdDelete } from '../../api/generated/sets/sets';
import { notifications } from '@mantine/notifications';
import { SetCard } from './components/SetCard';
import { useState, useEffect } from 'react';

const PAGE_SIZE = 12;

export default function Sets() {
    // 1. All hooks at the top
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string | null>(null);

    // Reset page to 1 when filters change
    useEffect(() => {
        setPage(1);
    }, [search, typeFilter]);

    const { data: pageData, isLoading, error, refetch } = useReadSetsApiSetsGet({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: search || undefined,
        creator_type: typeFilter || undefined
    });

    const sets = pageData?.items || [];
    const totalCount = pageData?.total || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const deleteMutation = useDeleteSetApiSetsSetIdDelete();

    // 2. Early returns
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
                    Could not fetch sets from the backend. Make sure your FastAPI server is running!
                </Alert>
            </Container>
        );
    }

    // 3. Handlers
    const handleDelete = async (setId: number) => {
        try {
            await deleteMutation.mutateAsync({ setId });
            notifications.show({
                title: 'Set deleted',
                message: 'The set has been removed from your library.',
                color: 'blue',
            });
            refetch();
        } catch {
            notifications.show({
                title: 'Error',
                message: 'Could not delete the set.',
                color: 'red',
            });
        }
    };

    return (
        <Container size="xl">
            <Title order={1} mb="xs">📚 Wallpaper Sets</Title>
            <Text c="dimmed" mb="xl">Browse and manage your curated wallpaper collections.</Text>

            <Group mb="xl" grow align="flex-end">
                <TextInput
                    placeholder="Search titles or artists..."
                    label="Search entire library"
                    leftSection={<IconSearch size={16} />}
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                />
                <Select
                    label="Artist type"
                    placeholder="All types"
                    leftSection={<IconFilter size={16} />}
                    data={['Artist', 'AI Generated', 'Studio', 'Photography']}
                    clearable
                    value={typeFilter}
                    onChange={setTypeFilter}
                />
            </Group>
            
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
                {sets.map((set) => (
                    <SetCard key={set.id} set={set} onDelete={handleDelete} />
                ))}
            </SimpleGrid>
            
            {sets.length === 0 && (
                <Stack align="center" py={100} gap="md">
                    <Text size="xl" fw={500} c="dimmed">No sets match your filters</Text>
                    <Text c="dimmed">Try adjusting your search terms or clearing the type filter.</Text>
                </Stack>
            )}

            {totalPages > 1 && (
                <Center mt="xl" pb="xl">
                    <Pagination total={totalPages} value={page} onChange={setPage} withEdges />
                </Center>
            )}
        </Container>
    );
}
