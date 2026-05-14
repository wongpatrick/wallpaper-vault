import { useForm } from '@mantine/form';
import { useState, useEffect } from 'react';
import { useReadSettingsApiSettingsGet, useUpdateSettingApiSettingsKeyPut } from '../../../api/generated/settings/settings';
import { notifications } from '@mantine/notifications';

export const SETTING_KEYS = {
    BASE_LIBRARY_PATH: 'base_library_path',
    AUTO_PARSE_PATH: 'auto_parse_path',
    HORIZONTAL_TARGET_RATIO: 'horizontal_target_ratio',
    VERTICAL_TARGET_RATIO: 'vertical_target_ratio',
    START_ON_LOGIN: 'start_on_login',
} as const;

export interface SettingsForm {
    [SETTING_KEYS.BASE_LIBRARY_PATH]: string;
    [SETTING_KEYS.AUTO_PARSE_PATH]: string;
    [SETTING_KEYS.HORIZONTAL_TARGET_RATIO]: string;
    [SETTING_KEYS.VERTICAL_TARGET_RATIO]: string;
    [SETTING_KEYS.START_ON_LOGIN]: boolean;
}

type StorageType = 'backend' | 'electron';

interface SettingConfig {
    key: string;
    defaultValue: string | boolean;
    storage: StorageType;
    description?: string;
}

const SETTINGS_METADATA: SettingConfig[] = [
    { key: SETTING_KEYS.BASE_LIBRARY_PATH, defaultValue: '', storage: 'backend', description: 'Root directory for wallpaper sets' },
    { key: SETTING_KEYS.AUTO_PARSE_PATH, defaultValue: '', storage: 'backend', description: 'Directory to scan for new imports' },
    { key: SETTING_KEYS.HORIZONTAL_TARGET_RATIO, defaultValue: '16/9', storage: 'backend', description: 'Target aspect ratio for horizontal images' },
    { key: SETTING_KEYS.VERTICAL_TARGET_RATIO, defaultValue: '9/16', storage: 'backend', description: 'Target aspect ratio for vertical images' },
    { key: SETTING_KEYS.START_ON_LOGIN, defaultValue: false, storage: 'electron' },
];

export function useSettingsForm() {
    const { data: settings, isLoading } = useReadSettingsApiSettingsGet();
    const updateSetting = useUpdateSettingApiSettingsKeyPut();
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm<SettingsForm>({
        initialValues: SETTINGS_METADATA.reduce((acc, config) => {
            acc[config.key as keyof SettingsForm] = config.defaultValue as any;
            return acc;
        }, {} as SettingsForm),
    });

    useEffect(() => {
        const initForm = async () => {
            if (!settings) return;

            const values: Partial<SettingsForm> = {};

            for (const config of SETTINGS_METADATA) {
                if (config.storage === 'backend') {
                    const dbSetting = settings.find(s => s.key === config.key);
                    values[config.key as keyof SettingsForm] = (dbSetting?.value ?? config.defaultValue) as any;
                } else if (config.storage === 'electron') {
                    if (window.electron?.getLoginSettings) {
                        values[config.key as keyof SettingsForm] = (await window.electron.getLoginSettings()) as any;
                    }
                }
            }

            form.initialize(values as SettingsForm);
        };

        initForm();
    }, [settings]);

    const handleSave = async (values: SettingsForm) => {
        setIsSaving(true);
        try {
            const promises: Promise<any>[] = [];

            for (const config of SETTINGS_METADATA) {
                const value = values[config.key as keyof SettingsForm];
                
                if (config.storage === 'backend') {
                    promises.push(updateSetting.mutateAsync({ 
                        key: config.key, 
                        data: { 
                            value: String(value), 
                            description: config.description 
                        } 
                    }));
                } else if (config.storage === 'electron') {
                    if (window.electron?.setLoginSettings) {
                        promises.push(window.electron.setLoginSettings(value as boolean));
                    }
                }
            }

            await Promise.all(promises);
            
            form.resetDirty();
            notifications.show({ title: 'Success', message: 'Settings saved successfully', color: 'green' });
        } catch (error) {
            console.error('Save failed:', error);
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
