import { Title, Text, Container, Table, Group, Avatar, Loader, Center, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useReadCreatorsApiCreatorsGet } from '../../api/generated/creators/creators';

export default function Creators() {
    const { data: creators, isLoading, error } = useReadCreatorsApiCreatorsGet();

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

    const rows = creators?.map((element) => (
        <Table.Tr key={element.id}>
            <Table.Td>
                <Group gap="sm">
                    <Avatar size={30} radius={30} color="blue" />
                    <Text size="sm" fw={500}>
                        {element.canonical_name}
                    </Text>
                </Group>
            </Table.Td>
            <Table.Td>{element.type || 'N/A'}</Table.Td>
            <Table.Td c="dimmed">{element.notes || '-'}</Table.Td>
        </Table.Tr>
    ));

    return (
        <Container size="xl">
            <Title order={1} mb="md">🎨 Artists & Creators</Title>
            <Text c="dimmed" mb="xl">Manage the talented people behind your favorite wallpapers.</Text>
            
            <Table.ScrollContainer minWidth={500}>
                <Table verticalSpacing="sm">
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
            
            {creators?.length === 0 && (
                <Text ta="center" py="xl" c="dimmed">No creators found. Add some in the backend!</Text>
            )}
        </Container>
    );
}
