import { Title, Text, Container, SimpleGrid, Loader, Center, Alert, Stack, TextInput, Group, Select } from '@mantine/core';
import { IconAlertCircle, IconSearch, IconFilter } from '@tabler/icons-react';
import { useReadSetsApiSetsGet, useDeleteSetApiSetsSetIdDelete } from '../../api/generated/sets/sets';
import { notifications } from '@mantine/notifications';
import { SetCard } from './components/SetCard';
import { useState, useMemo } from 'react';

export default function Sets() {
    const { data: sets, isLoading, error, refetch } = useReadSetsApiSetsGet();
    const deleteMutation = useDeleteSetApiSetsSetIdDelete();

    // Filter State
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string | null>(null);

    const filteredSets = useMemo(() => {
        if (!sets) return [];
        return sets.filter(set => {
            const matchesSearch = !search || 
                set.title?.toLowerCase().includes(search.toLowerCase()) ||
                set.creators?.some(c => c.canonical_name.toLowerCase().includes(search.toLowerCase()));
            
            const matchesType = !typeFilter || 
                set.creators?.some(c => c.type === typeFilter);

            return matchesSearch && matchesType;
        });
    }, [sets, search, typeFilter]);

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
                    placeholder="Search by title or artist..."
                    label="Search library"
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
                {filteredSets.map((set) => (
                    <SetCard key={set.id} set={set} onDelete={handleDelete} />
                ))}
            </SimpleGrid>
            
            {filteredSets.length === 0 && (
                <Stack align="center" py={100} gap="md">
                    <Text size="xl" fw={500} c="dimmed">No sets match your filters</Text>
                    <Text c="dimmed">Try adjusting your search terms or clearing the type filter.</Text>
                </Stack>
            )}
        </Container>
    );
}
