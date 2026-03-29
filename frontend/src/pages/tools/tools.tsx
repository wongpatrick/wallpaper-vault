import { Title, Text, Container, Card } from '@mantine/core';

export default function Tools() {
    return (
        <Container size="xl">
            <Title order={1} mb="md">🛠️ Wallpaper Tools</Title>
            <Text c="dimmed" mb="xl">Automation and utility scripts to manage your collection.</Text>
            
            <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={4} mb="xs">Coming Soon...</Title>
                <Text size="sm" c="dimmed">
                    Bulk renaming, duplicate detection, and format conversion tools will be available here.
                </Text>
            </Card>
        </Container>
    );
}
