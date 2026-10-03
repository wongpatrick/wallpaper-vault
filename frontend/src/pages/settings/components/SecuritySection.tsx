/**
 * @file
 * Module: SecuritySection Component
 * Description: Settings section for backend server URL and API authorization tokens.
 */
import { Stack, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { SettingsSection } from './SettingsSection';
import { SETTING_KEYS, type SettingsForm } from '../hooks/useSettingsForm';

interface SecuritySectionProps {
    form: UseFormReturnType<SettingsForm>;
}

export function SecuritySection({ form }: SecuritySectionProps) {
    return (
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
    );
}
