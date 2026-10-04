/**
 * @file
 * Module: SystemIntegrationSection Component
 * Description: Settings section for OS auto-start, tray close behavior, and backend port configuration.
 */
import { Stack, Switch, Select, NumberInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { SettingsSection } from './SettingsSection';
import { SETTING_KEYS, type SettingsForm } from '../hooks/useSettingsForm';

const PORT_MIN = 1024;
const PORT_MAX = 65535;

const CLOSE_BEHAVIOR_OPTIONS = [
    { value: 'minimize', label: 'Minimize to system tray (keep running in background)' },
    { value: 'exit', label: 'Exit application completely' }
];

interface SystemIntegrationSectionProps {
    form: UseFormReturnType<SettingsForm>;
}

export function SystemIntegrationSection({ form }: SystemIntegrationSectionProps) {
    return (
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
                            data={CLOSE_BEHAVIOR_OPTIONS}
                            allowDeselect={false}
                            {...form.getInputProps(SETTING_KEYS.CLOSE_BEHAVIOR)}
                        />
                        <NumberInput
                            label="Backend Service Port"
                            description="Configure the network port for the backend server. Requires application restart. (Default: 8000)"
                            min={PORT_MIN}
                            max={PORT_MAX}
                            placeholder="8000"
                            {...form.getInputProps(SETTING_KEYS.BACKEND_PORT)}
                        />
                    </>
                )}
            </Stack>
        </SettingsSection>
    );
}
