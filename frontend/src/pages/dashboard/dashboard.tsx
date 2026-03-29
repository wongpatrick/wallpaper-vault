import { Title, Text, Container } from '@mantine/core';

export default function Dashboard() {
    return (
        <Container size="xl">
            <Title order={1} mb="md">📊 Dashboard</Title>
            <Text c="dimmed" mb="xl">Welcome to your Wallpaper Vault. Your collection overview will appear here.</Text>
        </Container>
    );
}
