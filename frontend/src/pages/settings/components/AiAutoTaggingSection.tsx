/**
 * @file
 * Module: AiAutoTaggingSection Component
 * Description: Settings section for configuring AI auto-tagging models, model sources, downloads, and scoring thresholds.
 */
import {
    Stack,
    Switch,
    Select,
    TextInput,
    Paper,
    Group,
    Text,
    Badge,
    Loader,
    Button,
    Slider
} from '@mantine/core';
import { IconCheck, IconCloudDownload } from '@tabler/icons-react';
import type { UseFormReturnType } from '@mantine/form';
import { SettingsSection } from './SettingsSection';
import { PathInput } from '../../../components/ui/PathInput';
import { SETTING_KEYS, type SettingsForm } from '../hooks/useSettingsForm';
import type { useSettingsAiModel } from '../hooks/useSettingsAiModel';

const MIN_THRESHOLD = 0.1;
const MAX_THRESHOLD = 1.0;
const STEP_THRESHOLD = 0.05;
const BADGE_LOADER_SIZE = 10;
const BADGE_ICON_SIZE = 12;
const BUTTON_ICON_SIZE = 14;

const PREDEFINED_MODELS = [
    { value: 'wd_eva02_large_v3', label: 'WD EVA02 Large v3 (Latest SOTA - Recommended)' },
    { value: 'wd_swinv2_v3', label: 'WD SwinV2 v3 (High Quality Scenes)' },
    { value: 'wd_convnext_v3', label: 'WD ConvNeXt v3 (Fast & Balanced)' },
    { value: 'wd_vit_large_v3', label: 'WD ViT Large v3 (v3 Large)' },
    { value: 'wd_vit_v3', label: 'WD ViT v3 (Lightweight)' },
    { value: 'wd14_convnext_v2', label: 'WD14 ConvNeXt v2 (Legacy)' },
    { value: 'wd14_vit_v2', label: 'WD14 ViT v2 (Legacy)' },
    { value: 'wd14_swinv2_v2', label: 'WD14 SwinV2 v2 (Legacy)' }
];

const MODEL_SOURCES = [
    { value: 'predefined', label: 'Predefined Tagger Models' },
    { value: 'huggingface', label: 'Custom Hugging Face Repository' },
    { value: 'local', label: 'Custom Local Model Folder' }
];

interface AiAutoTaggingSectionProps {
    form: UseFormReturnType<SettingsForm>;
    aiModel: ReturnType<typeof useSettingsAiModel>;
}

export function AiAutoTaggingSection({ form, aiModel }: AiAutoTaggingSectionProps) {
    const isAutoTagEnabled = !!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED];
    const modelSource = form.values[SETTING_KEYS.AI_MODEL_SOURCE] as string;
    const { modelStatus, isCheckingStatus, handleDownloadModel, isDownloading } = aiModel;

    return (
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
                    data={MODEL_SOURCES}
                    disabled={!isAutoTagEnabled}
                    {...form.getInputProps(SETTING_KEYS.AI_MODEL_SOURCE)}
                />

                {modelSource === 'predefined' && (
                    <Select
                        label="AI Model Type"
                        description="Select the AI model to use for analyzing and tagging images."
                        data={PREDEFINED_MODELS}
                        disabled={!isAutoTagEnabled}
                        {...form.getInputProps(SETTING_KEYS.AI_MODEL_TYPE)}
                    />
                )}

                {modelSource === 'huggingface' && (
                    <TextInput
                        label="Custom Hugging Face Repository"
                        description="The repository ID of the model (e.g. 'SmilingWolf/wd-eva02-large-tagger-v3'). Must contain 'model.onnx' and 'selected_tags.csv'."
                        placeholder="username/repo"
                        disabled={!isAutoTagEnabled}
                        {...form.getInputProps(SETTING_KEYS.AI_MODEL_CUSTOM_REPO)}
                    />
                )}

                {modelSource === 'local' && (
                    <PathInput
                        label="Custom Local Model Folder"
                        description="Path to the local directory containing model (.onnx) and label map (.csv) files."
                        placeholder="C:/path/to/model/folder"
                        disabled={!isAutoTagEnabled}
                        {...form.getInputProps(SETTING_KEYS.AI_MODEL_CUSTOM_PATH)}
                    />
                )}

                {/* Model Status & Pre-Download Action */}
                {isAutoTagEnabled && (
                    <Paper withBorder p="sm" radius="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                        <Group justify="space-between" align="center">
                            <Group gap="xs">
                                <Text size="xs" fw={600} c="dimmed">Model Status:</Text>
                                {isCheckingStatus ? (
                                    <Badge size="sm" variant="light" color="gray" leftSection={<Loader size={BADGE_LOADER_SIZE} />}>
                                        Checking Cache...
                                    </Badge>
                                ) : modelStatus?.is_cached ? (
                                    <Badge size="sm" variant="light" color="teal" leftSection={<IconCheck size={BADGE_ICON_SIZE} />}>
                                        Cached Locally ({modelStatus.human_size})
                                    </Badge>
                                ) : (
                                    <Badge size="sm" variant="light" color="yellow" leftSection={<IconCloudDownload size={BADGE_ICON_SIZE} />}>
                                        Not Downloaded
                                    </Badge>
                                )}
                            </Group>

                            {modelSource !== 'local' && (
                                <Button
                                    size="xs"
                                    variant={modelStatus?.is_cached ? 'subtle' : 'filled'}
                                    color={modelStatus?.is_cached ? 'gray' : 'blue'}
                                    leftSection={modelStatus?.is_cached ? <IconCheck size={BUTTON_ICON_SIZE} /> : <IconCloudDownload size={BUTTON_ICON_SIZE} />}
                                    onClick={handleDownloadModel}
                                    loading={isDownloading}
                                    disabled={modelStatus?.is_cached || isDownloading}
                                >
                                    {modelStatus?.is_cached ? 'Downloaded' : 'Download Model'}
                                </Button>
                            )}
                        </Group>
                    </Paper>
                )}

                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="sm" fw={500} c={!isAutoTagEnabled ? 'dimmed' : undefined}>
                            Tagger Confidence Threshold
                        </Text>
                        <Text size="sm" c="dimmed">
                            {form.values[SETTING_KEYS.AI_CONFIDENCE_THRESHOLD]?.toFixed(2)}
                        </Text>
                    </Group>
                    <Slider
                        min={MIN_THRESHOLD}
                        max={MAX_THRESHOLD}
                        step={STEP_THRESHOLD}
                        disabled={!isAutoTagEnabled}
                        {...form.getInputProps(SETTING_KEYS.AI_CONFIDENCE_THRESHOLD)}
                    />
                    <Text size="xs" c="dimmed">
                        Only tags with a confidence score above this threshold will be automatically applied to individual wallpapers.
                    </Text>
                </Stack>

                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="sm" fw={500} c={!isAutoTagEnabled ? 'dimmed' : undefined}>
                            Set Rollup Threshold
                        </Text>
                        <Text size="sm" c="dimmed">
                            {form.values[SETTING_KEYS.AI_ROLLUP_THRESHOLD]?.toFixed(2)}
                        </Text>
                    </Group>
                    <Slider
                        min={MIN_THRESHOLD}
                        max={MAX_THRESHOLD}
                        step={STEP_THRESHOLD}
                        disabled={!isAutoTagEnabled}
                        {...form.getInputProps(SETTING_KEYS.AI_ROLLUP_THRESHOLD)}
                    />
                    <Text size="xs" c="dimmed">
                        A tag must appear in at least this percentage of images in a Set to be automatically rolled up to the Set level.
                    </Text>
                </Stack>
            </Stack>
        </SettingsSection>
    );
}
