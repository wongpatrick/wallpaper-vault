/**
 * @file
 * Module: RotationSettingsSection Component
 * Description: Settings section for pausing wallpaper rotations and configuring desktop notifications.
 */
import { Stack, Switch } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { SettingsSection } from './SettingsSection';
import { SETTING_KEYS, type SettingsForm } from '../hooks/useSettingsForm';

interface RotationSettingsSectionProps {
    form: UseFormReturnType<SettingsForm>;
}

export function RotationSettingsSection({ form }: RotationSettingsSectionProps) {
    return (
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
    );
}
