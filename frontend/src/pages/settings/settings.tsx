import { Title, Text, Container, Card, Stack, Divider, TextInput, ActionIcon, Group, Button, LoadingOverlay, Modal } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconFolder, IconDeviceFloppy, IconAlertTriangle } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { useReadSettingsApiSettingsGet, useUpdateSettingApiSettingsKeyPut } from '../../api/generated/settings/settings';
import { notifications } from '@mantine/notifications';
import { useBlocker } from 'react-router-dom';

interface SettingsForm {
    base_library_path: string;
    auto_parse_path: string;
}

export default function Settings() {
    const { data: settings, isLoading } = useReadSettingsApiSettingsGet();
    const updateSetting = useUpdateSettingApiSettingsKeyPut();
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm<SettingsForm>({
        initialValues: {
            base_library_path: '',
            auto_parse_path: '',
        },
    });

    useEffect(() => {
        if (settings) {
            const lib = settings.find(s => s.key === 'base_library_path')?.value || '';
            const parse = settings.find(s => s.key === 'auto_parse_path')?.value || '';
            
            form.initialize({
                base_library_path: lib,
                auto_parse_path: parse,
            });
        }
    }, [settings]);

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            form.isDirty() && currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (form.isDirty()) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [form]);

    const handlePickDirectory = async (field: keyof SettingsForm) => {
        // @ts-ignore - electron is injected via preload
        const path = await window.electron.openDirectory();
        if (path) {
            form.setFieldValue(field, path);
        }
    };

    const handleSave = async (values: SettingsForm) => {
        setIsSaving(true);
        try {
            await Promise.all([
                updateSetting.mutateAsync({ 
                    key: 'base_library_path', 
                    data: { value: values.base_library_path, description: 'Root directory for wallpaper sets' } 
                }),
                updateSetting.mutateAsync({ 
                    key: 'auto_parse_path', 
                    data: { value: values.auto_parse_path, description: 'Directory to scan for new imports' } 
                })
            ]);
            
            form.resetDirty();
            
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
            
            <Modal 
                opened={blocker.state === "blocked"} 
                onClose={() => blocker.reset?.()}
                title={
                    <Group gap="xs">
                        <IconAlertTriangle color="var(--mantine-color-orange-6)" size={20} />
                        <Text fw={700}>Unsaved Changes</Text>
                    </Group>
                }
                centered
            >
                <Text size="sm" mb="lg">
                    You have unsaved changes in your settings. If you leave now, your changes will be lost.
                </Text>
                <Group justify="flex-end" gap="sm">
                    <Button variant="subtle" color="gray" onClick={() => blocker.reset?.()}>
                        Stay Here
                    </Button>
                    <Button color="red" onClick={() => blocker.proceed?.()}>
                        Discard & Leave
                    </Button>
                </Group>
            </Modal>

            <Title order={1} mb="md">⚙️ Settings</Title>
            <Text c="dimmed" mb="xl">Configure your Wallpaper Vault experience.</Text>
            
            <form onSubmit={form.onSubmit(handleSave)}>
                <Stack gap="xl">
                    <Card shadow="sm" padding="xl" radius="md" withBorder>
                        <Stack gap="md">
                            <Group justify="space-between">
                                <div>
                                    <Title order={4}>Storage & Library</Title>
                                    <Text size="sm" c="dimmed">Define where your high-resolution collection lives.</Text>
                                </div>
                                {form.isDirty() && (
                                    <Text size="xs" fw={700} color="orange" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <IconAlertTriangle size={14} /> UNSAVED CHANGES
                                    </Text>
                                )}
                            </Group>
                            
                            <Divider />

                            <TextInput
                                label="Base Library Path"
                                description="All managed wallpaper sets will be stored in this directory."
                                placeholder="C:/Users/You/Pictures/Wallpapers"
                                {...form.getInputProps('base_library_path')}
                                rightSection={
                                    <ActionIcon variant="subtle" color="gray" onClick={() => handlePickDirectory('base_library_path')}>
                                        <IconFolder size={18} />
                                    </ActionIcon>
                                }
                            />

                            <TextInput
                                label="Auto-Parse Path"
                                description="The automated tool will monitor this folder for new folders to import."
                                placeholder="C:/Users/You/Downloads/NewWallpapers"
                                {...form.getInputProps('auto_parse_path')}
                                rightSection={
                                    <ActionIcon variant="subtle" color="gray" onClick={() => handlePickDirectory('auto_parse_path')}>
                                        <IconFolder size={18} />
                                    </ActionIcon>
                                }
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
            </form>
        </Container>
    );
}
