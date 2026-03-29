import { Title, Text, Container, Card, Stack, Divider } from '@mantine/core';

export default function Settings() {
    return (
        <Container size="xl">
            <Title order={1} mb="md">⚙️ Settings</Title>
            <Text c="dimmed" mb="xl">Configure your Wallpaper Vault experience.</Text>
            
            <Card shadow="sm" padding="xl" radius="md" withBorder>
                <Stack>
                    <div>
                        <Title order={4}>General</Title>
                        <Text size="sm" c="dimmed">Basic application settings.</Text>
                    </div>
                    
                    <Divider />
                    
                </Stack>
            </Card>
        </Container>
    );
}
