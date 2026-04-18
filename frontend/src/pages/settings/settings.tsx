import { Title, Text, Container, Stack, LoadingOverlay, Button } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useSettingsForm, SETTING_KEYS } from './hooks/useSettingsForm';
import { SettingsSection } from './components/SettingsSection';
import { UnsavedChangesModal } from './components/UnsavedChangesModal';
import { AppInfoSection } from './components/AppInfoSection';
import { PathInput } from '../../components/ui/PathInput';

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
                        footer={
                            <Button 
                                type="submit"
                                leftSection={<IconDeviceFloppy size={18} />} 
                                loading={isSaving}
                                disabled={!form.isDirty()}
                            >
                                Save Changes
                            </Button>
                        }
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
                    </SettingsSection>

                    <AppInfoSection />
                </Stack>
            </form>
        </Container>
    );
}
