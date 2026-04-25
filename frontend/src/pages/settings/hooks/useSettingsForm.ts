import { useForm } from '@mantine/form';
import { useState, useEffect } from 'react';
import { useReadSettingsApiSettingsGet, useUpdateSettingApiSettingsKeyPut } from '../../../api/generated/settings/settings';
import { notifications } from '@mantine/notifications';

export const SETTING_KEYS = {
    BASE_LIBRARY_PATH: 'base_library_path',
    AUTO_PARSE_PATH: 'auto_parse_path',
    HORIZONTAL_TARGET_RATIO: 'horizontal_target_ratio',
    VERTICAL_TARGET_RATIO: 'vertical_target_ratio',
} as const;

export interface SettingsForm {
    [SETTING_KEYS.BASE_LIBRARY_PATH]: string;
    [SETTING_KEYS.AUTO_PARSE_PATH]: string;
    [SETTING_KEYS.HORIZONTAL_TARGET_RATIO]: string;
    [SETTING_KEYS.VERTICAL_TARGET_RATIO]: string;
}

export function useSettingsForm() {
    const { data: settings, isLoading } = useReadSettingsApiSettingsGet();
    const updateSetting = useUpdateSettingApiSettingsKeyPut();
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm<SettingsForm>({
        initialValues: {
            [SETTING_KEYS.BASE_LIBRARY_PATH]: '',
            [SETTING_KEYS.AUTO_PARSE_PATH]: '',
            [SETTING_KEYS.HORIZONTAL_TARGET_RATIO]: '16/9',
            [SETTING_KEYS.VERTICAL_TARGET_RATIO]: '9/16',
        },
    });

    useEffect(() => {
        if (settings) {
            const lib = settings.find(s => s.key === SETTING_KEYS.BASE_LIBRARY_PATH)?.value || '';
            const parse = settings.find(s => s.key === SETTING_KEYS.AUTO_PARSE_PATH)?.value || '';
            const horiz = settings.find(s => s.key === SETTING_KEYS.HORIZONTAL_TARGET_RATIO)?.value || '16/9';
            const vert = settings.find(s => s.key === SETTING_KEYS.VERTICAL_TARGET_RATIO)?.value || '9/16';
            
            form.initialize({
                [SETTING_KEYS.BASE_LIBRARY_PATH]: lib,
                [SETTING_KEYS.AUTO_PARSE_PATH]: parse,
                [SETTING_KEYS.HORIZONTAL_TARGET_RATIO]: horiz,
                [SETTING_KEYS.VERTICAL_TARGET_RATIO]: vert,
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
                }),
                updateSetting.mutateAsync({ 
                    key: SETTING_KEYS.HORIZONTAL_TARGET_RATIO, 
                    data: { value: values[SETTING_KEYS.HORIZONTAL_TARGET_RATIO], description: 'Target aspect ratio for horizontal images' } 
                }),
                updateSetting.mutateAsync({ 
                    key: SETTING_KEYS.VERTICAL_TARGET_RATIO, 
                    data: { value: values[SETTING_KEYS.VERTICAL_TARGET_RATIO], description: 'Target aspect ratio for vertical images' } 
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
