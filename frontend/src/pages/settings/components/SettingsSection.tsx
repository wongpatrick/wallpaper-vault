import { Card, Stack, Group, Title, Text, Divider } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { ReactNode } from 'react';

interface SettingsSectionProps {
    title: string;
    description: string;
    isDirty?: boolean;
    children: ReactNode;
}

export function SettingsSection({ title, description, isDirty, children }: SettingsSectionProps) {
    return (
        <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Stack gap="md">
                <Group justify="space-between">
                    <div>
                        <Title order={4}>{title}</Title>
                        <Text size="sm" c="dimmed">{description}</Text>
                    </div>
                    {isDirty && (
                        <Text size="xs" fw={700} color="orange" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <IconAlertTriangle size={14} /> UNSAVED CHANGES
                        </Text>
                    )}
                </Group>
                
                <Divider />
                {children}
            </Stack>
        </Card>
    );
}
