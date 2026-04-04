import { Title, Text, Container, Stack, Group, Button, LoadingOverlay } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useSettingsForm, SETTING_KEYS } from './hooks/useSettingsForm';
import { PathInput } from '../../components/ui/PathInput';
import { SettingsSection } from './components/SettingsSection';
import { UnsavedChangesModal } from './components/UnsavedChangesModal';

export default function Settings() {
    const { form, isLoading, isSaving, handleSave } = useSettingsForm();

    return (
        <Container size="xl" pos="relative">
            <LoadingOverlay visible={isLoading || isSaving} />
            <UnsavedChangesModal isDirty={form.isDirty()} />

            <Title order={1} mb="md">⚙️ Settings</Title>
            <Text c="dimmed" mb="xl">Configure your Wallpaper Vault experience.</Text>
            
            <form onSubmit={form.onSubmit(handleSave)}>
                <Stack gap="xl">
                    <SettingsSection 
                        title="Storage & Library" 
                        description="Define where your high-resolution collection lives."
                        isDirty={form.isDirty()}
                    >
                        <PathInput
                            label="Base Library Path"
                            description="All managed wallpaper sets will be stored in this directory."
                            placeholder="C:/Users/You/Pictures/Wallpapers"
                            {...form.getInputProps(SETTING_KEYS.BASE_LIBRARY_PATH)}
                        />

                        <PathInput
                            label="Auto-Parse Path"
                            description="The automated tool will monitor this folder for new folders to import."
                            placeholder="C:/Users/You/Downloads/NewWallpapers"
                            {...form.getInputProps(SETTING_KEYS.AUTO_PARSE_PATH)}
                        />

                        <Group justify="flex-end" mt="md">
                            <Button 
                                type="submit"
                                leftSection={<IconDeviceFloppy size={18} />} 
                                loading={isSaving}
                                disabled={!form.isDirty()}
                            >
                                Save Changes
                            </Button>
                        </Group>
                    </SettingsSection>

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
                </Stack>
            </form>
        </Container>
    );
}
