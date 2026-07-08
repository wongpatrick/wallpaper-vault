/**
 * @file
 * React hook for managing application settings form state.
 * Handles loading, saving, and syncing settings with the backend and Electron.
 */
import { useForm } from '@mantine/form';
import { useState, useEffect } from 'react';
import { useReadSettingsApiSettingsGet, useUpdateSettingApiSettingsKeyPut } from '../../../api/generated/settings/settings';
import { notifications } from '@mantine/notifications';
import { AXIOS_INSTANCE } from '../../../api/axios-instance';

export const SETTING_KEYS = {
    BASE_LIBRARY_PATH: 'base_library_path',
    AUTO_PARSE_PATH: 'auto_parse_path',
    HORIZONTAL_TARGET_RATIO: 'horizontal_target_ratio',
    VERTICAL_TARGET_RATIO: 'vertical_target_ratio',
    START_ON_LOGIN: 'start_on_login',
    CLOSE_BEHAVIOR: 'close_behavior',
    AI_AUTO_TAG_ENABLED: 'ai_auto_tag_enabled',
    AI_MODEL_SOURCE: 'ai_model_source',
    AI_MODEL_TYPE: 'ai_model_type',
    AI_MODEL_CUSTOM_REPO: 'ai_model_custom_repo',
    AI_MODEL_CUSTOM_PATH: 'ai_model_custom_path',
    AI_CONFIDENCE_THRESHOLD: 'ai_confidence_threshold',
    AI_ROLLUP_THRESHOLD: 'ai_rollup_threshold',
    BACKEND_PORT: 'backend_port',
    WALLPAPER_ROTATION_MODE: 'wallpaper_rotation_mode',
    WALLPAPER_ROTATION_INTERVAL: 'wallpaper_rotation_interval',
    FAVORITE_ROTATION_PROBABILITY: 'favorite_rotation_probability',
    WALLPAPER_ROTATION_SOURCE: 'wallpaper_rotation_source',
    WALLPAPER_ROTATION_PLAYLIST_ID: 'wallpaper_rotation_playlist_id',
    WALLPAPER_ROTATION_TARGET_MONITOR: 'wallpaper_rotation_target_monitor',
    BACKEND_URL: 'backend_url',
    API_KEY: 'api_key',
} as const;

export interface SettingsForm {
    [SETTING_KEYS.BASE_LIBRARY_PATH]: string;
    [SETTING_KEYS.AUTO_PARSE_PATH]: string;
    [SETTING_KEYS.HORIZONTAL_TARGET_RATIO]: string;
    [SETTING_KEYS.VERTICAL_TARGET_RATIO]: string;
    [SETTING_KEYS.START_ON_LOGIN]: boolean;
    [SETTING_KEYS.CLOSE_BEHAVIOR]: 'minimize' | 'exit';
    [SETTING_KEYS.AI_AUTO_TAG_ENABLED]: boolean;
    [SETTING_KEYS.AI_MODEL_SOURCE]: string;
    [SETTING_KEYS.AI_MODEL_TYPE]: string;
    [SETTING_KEYS.AI_MODEL_CUSTOM_REPO]: string;
    [SETTING_KEYS.AI_MODEL_CUSTOM_PATH]: string;
    [SETTING_KEYS.AI_CONFIDENCE_THRESHOLD]: number;
    [SETTING_KEYS.AI_ROLLUP_THRESHOLD]: number;
    [SETTING_KEYS.BACKEND_PORT]: number;
    [SETTING_KEYS.WALLPAPER_ROTATION_MODE]: 'displayfusion' | 'native';
    [SETTING_KEYS.WALLPAPER_ROTATION_INTERVAL]: number;
    [SETTING_KEYS.FAVORITE_ROTATION_PROBABILITY]: number;
    [SETTING_KEYS.WALLPAPER_ROTATION_SOURCE]: 'entire_library' | 'playlist';
    [SETTING_KEYS.WALLPAPER_ROTATION_PLAYLIST_ID]: string;
    [SETTING_KEYS.WALLPAPER_ROTATION_TARGET_MONITOR]: string;
    [SETTING_KEYS.BACKEND_URL]: string;
    [SETTING_KEYS.API_KEY]: string;
}

type StorageType = 'backend' | 'electron' | 'localStorage';

interface SettingConfig {
    key: string;
    defaultValue: string | boolean | number;
    storage: StorageType;
    description?: string;
}

const SETTINGS_METADATA: SettingConfig[] = [
    { key: SETTING_KEYS.BASE_LIBRARY_PATH, defaultValue: '', storage: 'backend', description: 'Root directory for wallpaper sets' },
    { key: SETTING_KEYS.AUTO_PARSE_PATH, defaultValue: '', storage: 'backend', description: 'Directory to scan for new imports' },
    { key: SETTING_KEYS.HORIZONTAL_TARGET_RATIO, defaultValue: '16/9', storage: 'backend', description: 'Target aspect ratio for horizontal images' },
    { key: SETTING_KEYS.VERTICAL_TARGET_RATIO, defaultValue: '9/16', storage: 'backend', description: 'Target aspect ratio for vertical images' },
    { key: SETTING_KEYS.START_ON_LOGIN, defaultValue: false, storage: 'electron' },
    { key: SETTING_KEYS.CLOSE_BEHAVIOR, defaultValue: 'minimize', storage: 'electron' },
    { key: SETTING_KEYS.AI_AUTO_TAG_ENABLED, defaultValue: false, storage: 'backend', description: 'Enable AI auto-tagging for imported wallpapers' },
    { key: SETTING_KEYS.AI_MODEL_SOURCE, defaultValue: 'predefined', storage: 'backend', description: 'Source of the AI model: predefined, huggingface, or local' },
    { key: SETTING_KEYS.AI_MODEL_TYPE, defaultValue: 'wd14_onnx', storage: 'backend', description: 'AI Model to use for auto-tagging' },
    { key: SETTING_KEYS.AI_MODEL_CUSTOM_REPO, defaultValue: '', storage: 'backend', description: 'Custom Hugging Face model repository ID' },
    { key: SETTING_KEYS.AI_MODEL_CUSTOM_PATH, defaultValue: '', storage: 'backend', description: 'Custom local filesystem folder path containing the model files' },
    { key: SETTING_KEYS.AI_CONFIDENCE_THRESHOLD, defaultValue: 0.35, storage: 'backend', description: 'Confidence threshold for tagger' },
    { key: SETTING_KEYS.AI_ROLLUP_THRESHOLD, defaultValue: 0.30, storage: 'backend', description: 'Threshold percentage for rolling up tags to sets' },
    { key: SETTING_KEYS.BACKEND_PORT, defaultValue: 8000, storage: 'electron' },
    { key: SETTING_KEYS.WALLPAPER_ROTATION_MODE, defaultValue: 'displayfusion', storage: 'backend', description: 'Wallpaper rotation mode: displayfusion or native' },
    { key: SETTING_KEYS.WALLPAPER_ROTATION_INTERVAL, defaultValue: 15, storage: 'backend', description: 'Wallpaper rotation interval in minutes (for native mode)' },
    { key: SETTING_KEYS.FAVORITE_ROTATION_PROBABILITY, defaultValue: 0.4, storage: 'backend', description: 'Probability rate (0.0 to 1.0) to select favorite wallpapers in random rotations' },
    { key: SETTING_KEYS.WALLPAPER_ROTATION_SOURCE, defaultValue: 'entire_library', storage: 'backend', description: 'Wallpaper rotation source: entire_library or playlist' },
    { key: SETTING_KEYS.WALLPAPER_ROTATION_PLAYLIST_ID, defaultValue: '', storage: 'backend', description: 'Target playlist ID to rotate (for playlist source)' },
    { key: SETTING_KEYS.WALLPAPER_ROTATION_TARGET_MONITOR, defaultValue: 'all', storage: 'backend', description: 'Target monitor: all, or 0, 1, 2, etc.' },
    { key: SETTING_KEYS.BACKEND_URL, defaultValue: '', storage: 'localStorage' },
    { key: SETTING_KEYS.API_KEY, defaultValue: '', storage: 'localStorage' },
];

export function useSettingsForm() {
    const { data: settings, isLoading } = useReadSettingsApiSettingsGet();
    const updateSetting = useUpdateSettingApiSettingsKeyPut();
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm<SettingsForm>({
        initialValues: SETTINGS_METADATA.reduce((acc, config) => {
            return { ...acc, [config.key]: config.defaultValue };
        }, {} as SettingsForm),
    });

    useEffect(() => {
        const initForm = async () => {
            if (!settings) return;

            const values: Partial<SettingsForm> = {};

            for (const config of SETTINGS_METADATA) {
                if (config.storage === 'backend') {
                    const dbSetting = settings.find(s => s.key === config.key);
                    let val: string | boolean | number;
                    if (dbSetting) {
                        if (typeof config.defaultValue === 'boolean') {
                            val = dbSetting.value === 'true';
                        } else if (typeof config.defaultValue === 'number') {
                            val = parseFloat(dbSetting.value);
                            if (isNaN(val)) val = config.defaultValue;
                        } else {
                            val = dbSetting.value;
                        }
                    } else {
                        val = config.defaultValue;
                    }
                    Reflect.set(values, config.key, val);
                } else if (config.storage === 'electron') {
                    if (config.key === SETTING_KEYS.START_ON_LOGIN) {
                        if (window.electron?.getLoginSettings) {
                            const loginSetting = await window.electron.getLoginSettings();
                            Reflect.set(values, config.key, loginSetting);
                        }
                    } else if (config.key === SETTING_KEYS.CLOSE_BEHAVIOR) {
                        if (window.electron?.getCloseBehavior) {
                            const closeBehavior = await window.electron.getCloseBehavior();
                            Reflect.set(values, config.key, closeBehavior);
                        }
                    } else if (config.key === SETTING_KEYS.BACKEND_PORT) {
                        if (window.electron?.getBackendStatus) {
                            const statusInfo = await window.electron.getBackendStatus();
                            Reflect.set(values, config.key, statusInfo.port);
                        }
                    }
                } else if (config.storage === 'localStorage') {
                    const localVal = localStorage.getItem(config.key) ?? String(config.defaultValue);
                    Reflect.set(values, config.key, localVal);
                }
            }

            form.initialize(values as SettingsForm);
        };

        initForm();
    }, [settings, form]);

    const handleSave = async (values: SettingsForm) => {
        setIsSaving(true);
        try {
            const promises: Promise<unknown>[] = [];

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
                    if (config.key === SETTING_KEYS.START_ON_LOGIN) {
                        if (window.electron?.setLoginSettings) {
                            promises.push(window.electron.setLoginSettings(value as boolean));
                        }
                    } else if (config.key === SETTING_KEYS.CLOSE_BEHAVIOR) {
                        if (window.electron?.setCloseBehavior) {
                            promises.push(window.electron.setCloseBehavior(value as 'minimize' | 'exit'));
                        }
                    } else if (config.key === SETTING_KEYS.BACKEND_PORT) {
                        if (window.electron?.setBackendPort) {
                            promises.push(window.electron.setBackendPort(value as number).then((ok) => {
                                if (ok) {
                                    AXIOS_INSTANCE.defaults.baseURL = `http://localhost:${value}`;
                                }
                            }));
                        }
                    }
                } else if (config.storage === 'localStorage') {
                    localStorage.setItem(config.key, String(value).trim());
                    if (config.key === SETTING_KEYS.BACKEND_URL) {
                        const newUrl = String(value).trim() || API_BASE_URL;
                        AXIOS_INSTANCE.defaults.baseURL = newUrl;
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
