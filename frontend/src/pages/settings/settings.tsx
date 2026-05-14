import { Title, Text, Container, Stack, LoadingOverlay, Button, Group, TextInput, Paper, Switch } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useSettingsForm, SETTING_KEYS } from './hooks/useSettingsForm';
import { SettingsSection } from './components/SettingsSection';
import { UnsavedChangesModal } from './components/UnsavedChangesModal';
import { AppInfoSection } from './components/AppInfoSection';
import { PathInput } from '../../components/ui/PathInput';

export default function Settings() {
    const { form, isLoading, isSaving, handleSave } = useSettingsForm();

    return (
        <Container size="xl" pos="relative" pb={100}>
            <LoadingOverlay visible={isLoading || isSaving} />
            
            <UnsavedChangesModal isDirty={form.isDirty()} />

            <form onSubmit={form.onSubmit(handleSave)}>
                <Title order={1} mb="xs">⚙️ Settings</Title>
                <Text c="dimmed" mb="xl">Configure your Wallpaper Vault experience.</Text>

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
                    </SettingsSection>

                    <SettingsSection 
                        title="Import & AI Processing" 
                        description="Configure your source paths and how the AI crops your wallpapers."
                        isDirty={form.isDirty()}
                    >
                        <Stack gap="md">
                            <PathInput
                                label="Auto-Parse Path"
                                description="The automated tool will monitor this folder for new folders to import."
                                placeholder="C:/Users/You/Downloads/NewWallpapers"
                                {...form.getInputProps(SETTING_KEYS.AUTO_PARSE_PATH)}
                            />

                            <Group grow>
                                <TextInput
                                    label="Horizontal Target Ratio"
                                    description="Default ratio for desktop wallpapers."
                                    placeholder="16/9"
                                    {...form.getInputProps(SETTING_KEYS.HORIZONTAL_TARGET_RATIO)}
                                />
                                <TextInput
                                    label="Vertical Target Ratio"
                                    description="Default ratio for mobile wallpapers."
                                    placeholder="9/16"
                                    {...form.getInputProps(SETTING_KEYS.VERTICAL_TARGET_RATIO)}
                                />
                            </Group>
                        </Stack>
                    </SettingsSection>

                    <SettingsSection 
                        title="System Integration" 
                        description="Control how the application interacts with your operating system."
                        isDirty={form.isDirty()}
                    >
                        <Switch
                            label="Start on Windows login"
                            description="Automatically launch the application minimized to the tray when you sign in."
                            {...form.getInputProps(SETTING_KEYS.START_ON_LOGIN, { type: 'checkbox' })}
                        />
                    </SettingsSection>

                    <AppInfoSection />
                </Stack>

                {/* Fixed Footer Bar */}
                <Paper
                    p="md"
                    radius={0}
                    style={{
                        position: 'fixed',
                        bottom: 0,
                        left: 'var(--app-shell-navbar-width, 0)',
                        right: 0,
                        zIndex: 100,
                        backgroundColor: 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))',
                        backdropFilter: 'blur(8px)',
                        borderTop: '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
                        boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.05)',
                        display: 'flex',
                        justifyContent: 'center'
                    }}
                >
                    <Container size="xl" style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                        <Group>
                            {form.isDirty() && (
                                <Text size="sm" c="blue.6" fw={600}>Pending unsaved changes</Text>
                            )}
                            <Button 
                                type="submit"
                                leftSection={<IconDeviceFloppy size={20} />} 
                                loading={isSaving}
                                disabled={!form.isDirty()}
                                size="md"
                                color="blue"
                                px={40}
                                radius="md"
                                variant={form.isDirty() ? "filled" : "light"}
                            >
                                Apply Changes
                            </Button>
                        </Group>
                    </Container>
                </Paper>
            </form>
        </Container>
    );
}
