/**
 * @file
 * Module: Settings Page
 * Description: The main application settings page, providing a form interface to manage library paths, import configurations, and system integration.
 */
import { Title, Text, Container, Stack, LoadingOverlay, Button, Group, TextInput, Paper, Switch, Select, Slider } from '@mantine/core';
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
                        title="AI Auto-Tagging" 
                        description="Configure automatic tagging of imported wallpapers using machine learning models."
                        isDirty={form.isDirty()}
                    >
                        <Stack gap="md">
                            <Switch
                                label="Enable AI Auto-Tagging"
                                description="Automatically generate tags for imported wallpapers using an AI model."
                                {...form.getInputProps(SETTING_KEYS.AI_AUTO_TAG_ENABLED, { type: 'checkbox' })}
                            />

                            <Select
                                label="AI Model Source"
                                description="Choose whether to use a predefined model, a custom model from Hugging Face, or a local model folder."
                                data={[
                                    { value: 'predefined', label: 'Predefined Tagger Models' },
                                    { value: 'huggingface', label: 'Custom Hugging Face Repository' },
                                    { value: 'local', label: 'Custom Local Model Folder' }
                                ]}
                                disabled={!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED]}
                                {...form.getInputProps(SETTING_KEYS.AI_MODEL_SOURCE)}
                            />

                            {form.values[SETTING_KEYS.AI_MODEL_SOURCE] === 'predefined' && (
                                <Select
                                    label="AI Model Type"
                                    description="Select the AI model to use for analyzing and tagging images."
                                    data={[
                                        { value: 'wd14_convnext_v2', label: 'WD14 ConvNeXt v2 (Recommended)' },
                                        { value: 'wd14_vit_v2', label: 'WD14 ViT v2 (Faster)' },
                                        { value: 'wd14_swinv2_v2', label: 'WD14 SwinV2 v2 (More Accurate)' },
                                        { value: 'wd_vit_large_v3', label: 'WD ViT Large v3 (Latest v3)' }
                                    ]}
                                    disabled={!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED]}
                                    {...form.getInputProps(SETTING_KEYS.AI_MODEL_TYPE)}
                                />
                            )}

                            {form.values[SETTING_KEYS.AI_MODEL_SOURCE] === 'huggingface' && (
                                <TextInput
                                    label="Custom Hugging Face Repository"
                                    description="The repository ID of the model (e.g. 'SmilingWolf/wd-v1-4-convnext-tagger-v2'). Must contain 'model.onnx' and 'selected_tags.csv'."
                                    placeholder="username/repo"
                                    disabled={!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED]}
                                    {...form.getInputProps(SETTING_KEYS.AI_MODEL_CUSTOM_REPO)}
                                />
                            )}

                            {form.values[SETTING_KEYS.AI_MODEL_SOURCE] === 'local' && (
                                <PathInput
                                    label="Custom Local Model Folder"
                                    description="Path to the local directory containing model (.onnx) and label map (.csv) files."
                                    placeholder="C:/path/to/model/folder"
                                    disabled={!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED]}
                                    {...form.getInputProps(SETTING_KEYS.AI_MODEL_CUSTOM_PATH)}
                                />
                            )}

                            <Stack gap="xs">
                                <Group justify="space-between">
                                    <Text size="sm" fw={500} c={!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED] ? 'dimmed' : undefined}>
                                        Tagger Confidence Threshold
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        {form.values[SETTING_KEYS.AI_CONFIDENCE_THRESHOLD]?.toFixed(2)}
                                    </Text>
                                </Group>
                                <Slider
                                    min={0.1}
                                    max={1.0}
                                    step={0.05}
                                    disabled={!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED]}
                                    {...form.getInputProps(SETTING_KEYS.AI_CONFIDENCE_THRESHOLD)}
                                />
                                <Text size="xs" c="dimmed">
                                    Only tags with a confidence score above this threshold will be automatically applied to individual wallpapers.
                                </Text>
                            </Stack>

                            <Stack gap="xs">
                                <Group justify="space-between">
                                    <Text size="sm" fw={500} c={!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED] ? 'dimmed' : undefined}>
                                        Set Rollup Threshold
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        {form.values[SETTING_KEYS.AI_ROLLUP_THRESHOLD]?.toFixed(2)}
                                    </Text>
                                </Group>
                                <Slider
                                    min={0.1}
                                    max={1.0}
                                    step={0.05}
                                    disabled={!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED]}
                                    {...form.getInputProps(SETTING_KEYS.AI_ROLLUP_THRESHOLD)}
                                />
                                <Text size="xs" c="dimmed">
                                    A tag must appear in at least this percentage of images in a Set to be automatically rolled up to the Set level.
                                </Text>
                            </Stack>
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
