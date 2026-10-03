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
    LoadingOverlay
} from '@mantine/core';
import { useSettingsForm, SETTING_KEYS } from './hooks/useSettingsForm';
import { useSettingsAiModel } from './hooks/useSettingsAiModel';
import { UnsavedChangesModal } from './components/UnsavedChangesModal';
import { AppInfoSection } from './components/AppInfoSection';
import { CacheManagementSection } from './components/CacheManagementSection';
import { LibraryPathsSection } from './components/LibraryPathsSection';
import { ConnectedVaultsSection } from './components/ConnectedVaultsSection';
import { ImportAiSection } from './components/ImportAiSection';
import { AiAutoTaggingSection } from './components/AiAutoTaggingSection';
import { RotationSettingsSection } from './components/RotationSettingsSection';
import { SystemIntegrationSection } from './components/SystemIntegrationSection';
import { SecuritySection } from './components/SecuritySection';
import { SettingsFooterBar } from './components/SettingsFooterBar';

const CONTAINER_PADDING_BOTTOM = 100;

export default function Settings() {
    const { form, isLoading, isSaving, handleSave } = useSettingsForm();

    const modelSource = form.values[SETTING_KEYS.AI_MODEL_SOURCE] as string;
    const modelType = form.values[SETTING_KEYS.AI_MODEL_TYPE] as string;
    const customRepo = form.values[SETTING_KEYS.AI_MODEL_CUSTOM_REPO] as string;
    const customPath = form.values[SETTING_KEYS.AI_MODEL_CUSTOM_PATH] as string;

    const aiModel = useSettingsAiModel({
        modelSource,
        modelType,
        customRepo,
        customPath,
        enabled: !!form.values[SETTING_KEYS.AI_AUTO_TAG_ENABLED],
    });

    return (
        <Container size="xl" pos="relative" pb={CONTAINER_PADDING_BOTTOM}>
            <LoadingOverlay visible={isLoading || isSaving} />
            
            <UnsavedChangesModal isDirty={form.isDirty()} />

            <form onSubmit={form.onSubmit(handleSave)}>
                <Title order={1} mb="xs">⚙️ Settings</Title>
                <Text c="dimmed" mb="xl">Configure your Wallpaper Vault experience.</Text>

                <Stack gap="xl">
                    <ConnectedVaultsSection />
                    <LibraryPathsSection />
                    <ImportAiSection form={form} />
                    <AiAutoTaggingSection form={form} aiModel={aiModel} />
                    <CacheManagementSection />
                    <RotationSettingsSection form={form} />
                    <SystemIntegrationSection form={form} />
                    <SecuritySection form={form} />
                    <AppInfoSection />
                </Stack>

                <SettingsFooterBar isDirty={form.isDirty()} isSaving={isSaving} />
            </form>
        </Container>
    );
}
