/**
 * @file
 * Module: ImportAiSection Component
 * Description: Settings section for configuring auto-parse import directories and aspect ratio targets.
 */
import { Stack, Group, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { SettingsSection } from './SettingsSection';
import { PathInput } from '../../../components/ui/PathInput';
import { SETTING_KEYS, type SettingsForm } from '../hooks/useSettingsForm';

interface ImportAiSectionProps {
    form: UseFormReturnType<SettingsForm>;
}

export function ImportAiSection({ form }: ImportAiSectionProps) {
    return (
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
    );
}
