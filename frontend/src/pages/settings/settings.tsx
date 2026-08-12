/**
 * @file
 * Module: Settings Page
 * Description: The main application settings page, providing a form interface to manage library paths, import configurations, and system integration.
 */
import {
    Title,
    Text,
    Container,
    Stack,
    LoadingOverlay,
    Button,
    Group,
    TextInput,
    Paper,
    Switch,
    Select,
    Slider,
    NumberInput,
    Badge,
    Loader
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconDeviceFloppy,
    IconCheck,
    IconCloudDownload
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettingsForm, SETTING_KEYS } from './hooks/useSettingsForm';
import { SettingsSection } from './components/SettingsSection';
import { UnsavedChangesModal } from './components/UnsavedChangesModal';
import { AppInfoSection } from './components/AppInfoSection';
import { CacheManagementSection } from './components/CacheManagementSection';
import { PathInput } from '../../components/ui/PathInput';
import {
    checkAiModelStatusApiSettingsCacheAiModelsStatusPost,
    useDownloadAiModelApiSettingsCacheAiModelsDownloadPost,
    getReadCacheStatsApiSettingsCacheGetQueryKey
} from '../../api/generated/settings/settings';

export default function Settings() {
    const { form, isLoading, isSaving, handleSave } = useSettingsForm();
    const queryClient = useQueryClient();

    const modelSource = form.values[SETTING_KEYS.AI_MODEL_SOURCE] as string;
    const modelType = form.values[SETTING_KEYS.AI_MODEL_TYPE] as string;
    const customRepo = form.values[SETTING_KEYS.AI_MODEL_CUSTOM_REPO] as string;
    const customPath = form.values[SETTING_KEYS.AI_MODEL_CUSTOM_PATH] as string;

    // Check cached status of currently selected model
    const { data: modelStatus, isLoading: isCheckingStatus, refetch: refetchStatus } = useQuery({
        queryKey: ['ai-model-status', modelSource, modelType, customRepo, customPath],
        queryFn: ({ signal }) => checkAiModelStatusApiSettingsCacheAiModelsStatusPost(
            {
                model_source: modelSource,
                model_type: modelType,
                custom_repo: customRepo,
                custom_path: customPath
            },
            undefined,
            undefined,
            signal
        ),
        enabled: !!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED]
    });

    const downloadMutation = useDownloadAiModelApiSettingsCacheAiModelsDownloadPost();

    const handleDownloadModel = async () => {
        try {
            const res = await downloadMutation.mutateAsync({
                data: {
                    model_source: modelSource,
                    model_type: modelType,
                    custom_repo: customRepo,
                    custom_path: customPath
                }
            });
            notifications.show({
                title: 'Model Downloaded',
                message: res.message || `Successfully downloaded ${res.model_name} (${res.human_size})`,
                color: 'teal',
                icon: <IconCheck size={16} />
            });
            refetchStatus();
            queryClient.invalidateQueries({ queryKey: getReadCacheStatsApiSettingsCacheGetQueryKey() });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to download model';
            notifications.show({
                title: 'Download Failed',
                message,
                color: 'red'
            });
        }
    };

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
                                        { value: 'wd_eva02_large_v3', label: 'WD EVA02 Large v3 (Latest SOTA - Recommended)' },
                                        { value: 'wd_swinv2_v3', label: 'WD SwinV2 v3 (High Quality Scenes)' },
                                        { value: 'wd_convnext_v3', label: 'WD ConvNeXt v3 (Fast & Balanced)' },
                                        { value: 'wd_vit_large_v3', label: 'WD ViT Large v3 (v3 Large)' },
                                        { value: 'wd_vit_v3', label: 'WD ViT v3 (Lightweight)' },
                                        { value: 'wd14_convnext_v2', label: 'WD14 ConvNeXt v2 (Legacy)' },
                                        { value: 'wd14_vit_v2', label: 'WD14 ViT v2 (Legacy)' },
                                        { value: 'wd14_swinv2_v2', label: 'WD14 SwinV2 v2 (Legacy)' }
                                    ]}
                                    disabled={!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED]}
                                    {...form.getInputProps(SETTING_KEYS.AI_MODEL_TYPE)}
                                />
                            )}

                            {form.values[SETTING_KEYS.AI_MODEL_SOURCE] === 'huggingface' && (
                                <TextInput
                                    label="Custom Hugging Face Repository"
                                    description="The repository ID of the model (e.g. 'SmilingWolf/wd-eva02-large-tagger-v3'). Must contain 'model.onnx' and 'selected_tags.csv'."
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

                            {/* Model Status & Pre-Download Action */}
                            {form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED] && (
                                <Paper withBorder p="sm" radius="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                                    <Group justify="space-between" align="center">
                                        <Group gap="xs">
                                            <Text size="xs" fw={600} c="dimmed">Model Status:</Text>
                                            {isCheckingStatus ? (
                                                <Badge size="sm" variant="light" color="gray" leftSection={<Loader size={10} />}>
                                                    Checking Cache...
                                                </Badge>
                                            ) : modelStatus?.is_cached ? (
                                                <Badge size="sm" variant="light" color="teal" leftSection={<IconCheck size={12} />}>
                                                    Cached Locally ({modelStatus.human_size})
                                                </Badge>
                                            ) : (
                                                <Badge size="sm" variant="light" color="yellow" leftSection={<IconCloudDownload size={12} />}>
                                                    Not Downloaded
                                                </Badge>
                                            )}
                                        </Group>

                                        {modelSource !== 'local' && (
                                            <Button
                                                size="xs"
                                                variant={modelStatus?.is_cached ? "subtle" : "filled"}
                                                color={modelStatus?.is_cached ? "gray" : "blue"}
                                                leftSection={modelStatus?.is_cached ? <IconCheck size={14} /> : <IconCloudDownload size={14} />}
                                                onClick={handleDownloadModel}
                                                loading={downloadMutation.isPending}
                                                disabled={modelStatus?.is_cached || downloadMutation.isPending}
                                            >
                                                {modelStatus?.is_cached ? 'Downloaded' : 'Download Model'}
                                            </Button>
                                        )}
                                    </Group>
                                </Paper>
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

                    {/* Cache & Storage Management Section */}
                    <CacheManagementSection />

                    <SettingsSection 
                        title="Rotation Settings" 
                        description="Control the automatic wallpaper rotation engine."
                        isDirty={form.isDirty()}
                    >
                        <Stack gap="md">
                            <Switch
                                label="Pause Wallpaper Rotation"
                                description="Temporarily suspend all scheduled wallpaper rotations."
                                {...form.getInputProps(SETTING_KEYS.WALLPAPER_ROTATION_PAUSED, { type: 'checkbox' })}
                            />
                            <Switch
                                label="Desktop Notifications on Wallpaper Change"
                                description="Show native OS notification banners whenever the wallpaper rotates or skips."
                                {...form.getInputProps(SETTING_KEYS.WALLPAPER_ROTATION_NOTIFICATIONS_ENABLED, { type: 'checkbox' })}
                            />
                        </Stack>
                    </SettingsSection>

                    <SettingsSection 
                        title="System Integration" 
                        description="Control how the application interacts with your operating system."
                        isDirty={form.isDirty()}
                    >
                        <Stack gap="md">
                            <Switch
                                label="Start on Windows login"
                                description="Automatically launch the application minimized to the tray when you sign in."
                                {...form.getInputProps(SETTING_KEYS.START_ON_LOGIN, { type: 'checkbox' })}
                            />

                            {window.electron && (
                                <>
                                    <Select
                                        label="Close Behavior"
                                        description="Choose what happens when you close the main application window."
                                        data={[
                                            { value: 'minimize', label: 'Minimize to system tray (keep running in background)' },
                                            { value: 'exit', label: 'Exit application completely' }
                                        ]}
                                        allowDeselect={false}
                                        {...form.getInputProps(SETTING_KEYS.CLOSE_BEHAVIOR)}
                                    />
                                    <NumberInput
                                        label="Backend Service Port"
                                        description="Configure the network port for the backend server. Requires application restart. (Default: 8000)"
                                        min={1024}
                                        max={65535}
                                        placeholder="8000"
                                        {...form.getInputProps(SETTING_KEYS.BACKEND_PORT)}
                                    />
                                </>
                            )}
                        </Stack>
                    </SettingsSection>

                    <SettingsSection 
                        title="Network & API Security" 
                        description="Configure remote server connection settings and API credentials."
                        isDirty={form.isDirty()}
                    >
                        <Stack gap="md">
                            <TextInput
                                label="Backend Base URL"
                                description="The connection endpoint for the backend server. Leave empty to use local port configuration."
                                placeholder="http://localhost:8000"
                                {...form.getInputProps(SETTING_KEYS.BACKEND_URL)}
                            />

                            <TextInput
                                label="API Key / Token"
                                description="Pre-shared key used to authenticate requests to the remote backend."
                                placeholder="Enter API Key / Token"
                                type="password"
                                {...form.getInputProps(SETTING_KEYS.API_KEY)}
                            />
                        </Stack>
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
