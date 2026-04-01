import { Title, Text, Container, Card, Stack, Divider, TextInput, ActionIcon, Group, Button, LoadingOverlay } from '@mantine/core';
import { IconFolder, IconDeviceFloppy } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { useReadSettingsApiSettingsGet, useUpdateSettingApiSettingsKeyPut } from '../../api/generated/settings/settings';
import { notifications } from '@mantine/notifications';

export default function Settings() {
    const { data: settings, isLoading } = useReadSettingsApiSettingsGet();
    const updateSetting = useUpdateSettingApiSettingsKeyPut();

    const [libraryPath, setLibraryPath] = useState('');
    const [parsePath, setParsePath] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (settings) {
            const lib = settings.find(s => s.key === 'base_library_path');
            const parse = settings.find(s => s.key === 'auto_parse_path');
            if (lib) setLibraryPath(lib.value);
            if (parse) setParsePath(parse.value);
        }
    }, [settings]);

    const handlePickDirectory = async (target: 'library' | 'parse') => {
        // @ts-ignore - electron is injected via preload
        const path = await window.electron.openDirectory();
        if (path) {
            if (target === 'library') setLibraryPath(path);
            else setParsePath(path);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await Promise.all([
                updateSetting.mutateAsync({ 
                    key: 'base_library_path', 
                    data: { value: libraryPath, description: 'Root directory for wallpaper sets' } 
                }),
                updateSetting.mutateAsync({ 
                    key: 'auto_parse_path', 
                    data: { value: parsePath, description: 'Directory to scan for new imports' } 
                })
            ]);
            notifications.show({
                title: 'Success',
                message: 'Settings saved successfully',
                color: 'green'
            });
        } catch (error) {
            notifications.show({
                title: 'Error',
                message: 'Failed to save settings',
                color: 'red'
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Container size="xl" pos="relative">
            <LoadingOverlay visible={isLoading || isSaving} />
            <Title order={1} mb="md">⚙️ Settings</Title>
            <Text c="dimmed" mb="xl">Configure your Wallpaper Vault experience.</Text>
            
            <Stack gap="xl">
                <Card shadow="sm" padding="xl" radius="md" withBorder>
                    <Stack gap="md">
                        <div>
                            <Title order={4}>Storage & Library</Title>
                            <Text size="sm" c="dimmed">Define where your high-resolution collection lives.</Text>
                        </div>
                        
                        <Divider />

                        <TextInput
                            label="Base Library Path"
                            description="All managed wallpaper sets will be stored in this directory."
                            placeholder="C:/Users/You/Pictures/Wallpapers"
                            value={libraryPath}
                            onChange={(e) => setLibraryPath(e.currentTarget.value)}
                            rightSection={
                                <ActionIcon variant="subtle" color="gray" onClick={() => handlePickDirectory('library')}>
                                    <IconFolder size={18} />
                                </ActionIcon>
                            }
                        />

                        <TextInput
                            label="Auto-Parse Path"
                            description="The automated tool will monitor this folder for new folders to import."
                            placeholder="C:/Users/You/Downloads/NewWallpapers"
                            value={parsePath}
                            onChange={(e) => setParsePath(e.currentTarget.value)}
                            rightSection={
                                <ActionIcon variant="subtle" color="gray" onClick={() => handlePickDirectory('parse')}>
                                    <IconFolder size={18} />
                                </ActionIcon>
                            }
                        />

                        <Group justify="flex-end" mt="md">
                            <Button 
                                leftSection={<IconDeviceFloppy size={18} />} 
                                onClick={handleSave}
                                loading={isSaving}
                            >
                                Save Changes
                            </Button>
                        </Group>
                    </Stack>
                </Card>

                <Card shadow="sm" padding="xl" radius="md" withBorder>
                    <Stack>
                        <div>
                            <Title order={4}>Application Info</Title>
                            <Text size="sm" c="dimmed">Version and environment details.</Text>
                        </div>
                        <Divider />
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
                    </Stack>
                </Card>
            </Stack>
        </Container>
    );
}
