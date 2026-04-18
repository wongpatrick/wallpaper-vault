import { Text, Group } from '@mantine/core';
import { SettingsSection } from './SettingsSection';

export function AppInfoSection() {
    return (
        <SettingsSection 
            title="Application Info" 
            description="Version and environment details."
        >
            <Group grow>
                <div>
                    <Text size="xs" fw={700} c="dimmed">VERSION</Text>
                    <Text size="sm">v0.1.0-alpha</Text>
                </div>
                <div>
                    <Text size="xs" fw={700} c="dimmed">ENGINE</Text>
                    <Text size="sm">FastAPI + SQLite</Text>
                </div>
                <div>
                    <Text size="xs" fw={700} c="dimmed">SHELL</Text>
                    <Text size="sm">Electron + React</Text>
                </div>
            </Group>
        </SettingsSection>
    );
}
