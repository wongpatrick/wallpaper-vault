import { useForm } from '@mantine/form';
import { useState, useEffect } from 'react';
import { useReadSettingsApiSettingsGet, useUpdateSettingApiSettingsKeyPut } from '../../../api/generated/settings/settings';
import { notifications } from '@mantine/notifications';

export const SETTING_KEYS = {
    BASE_LIBRARY_PATH: 'base_library_path',
    AUTO_PARSE_PATH: 'auto_parse_path',
} as const;

export interface SettingsForm {
    [SETTING_KEYS.BASE_LIBRARY_PATH]: string;
    [SETTING_KEYS.AUTO_PARSE_PATH]: string;
}

export function useSettingsForm() {
    const { data: settings, isLoading } = useReadSettingsApiSettingsGet();
    const updateSetting = useUpdateSettingApiSettingsKeyPut();
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm<SettingsForm>({
        initialValues: {
            [SETTING_KEYS.BASE_LIBRARY_PATH]: '',
            [SETTING_KEYS.AUTO_PARSE_PATH]: '',
        },
    });

    useEffect(() => {
        if (settings) {
            const lib = settings.find(s => s.key === SETTING_KEYS.BASE_LIBRARY_PATH)?.value || '';
            const parse = settings.find(s => s.key === SETTING_KEYS.AUTO_PARSE_PATH)?.value || '';
            
            form.initialize({
                [SETTING_KEYS.BASE_LIBRARY_PATH]: lib,
                [SETTING_KEYS.AUTO_PARSE_PATH]: parse,
            });
        }
    }, [settings]);

    const handleSave = async (values: SettingsForm) => {
        setIsSaving(true);
        try {
            await Promise.all([
                updateSetting.mutateAsync({ 
                    key: SETTING_KEYS.BASE_LIBRARY_PATH, 
                    data: { value: values[SETTING_KEYS.BASE_LIBRARY_PATH], description: 'Root directory for wallpaper sets' } 
                }),
                updateSetting.mutateAsync({ 
                    key: SETTING_KEYS.AUTO_PARSE_PATH, 
                    data: { value: values[SETTING_KEYS.AUTO_PARSE_PATH], description: 'Directory to scan for new imports' } 
                })
            ]);
            
            form.resetDirty();
            notifications.show({ title: 'Success', message: 'Settings saved successfully', color: 'green' });
        } catch (error) {
            notifications.show({ title: 'Error', message: 'Failed to save settings', color: 'red' });
        } finally {
            setIsSaving(false);
        }
    };

    return {
        form,
        isLoading,
        isSaving,
        handleSave,
    };
}
