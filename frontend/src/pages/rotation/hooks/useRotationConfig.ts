/**
 * @file Rotation configuration and profiles management hook.
 */
/* eslint-disable no-magic-numbers */
import { useState, useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { useReadSettingsApiSettingsGet, useUpdateSettingApiSettingsKeyPut } from '../../../api/generated/settings/settings';
import { useReadPlaylistsApiPlaylistsGet } from '../../../api/generated/playlists/playlists';
import {
    useListProfilesApiRotationProfilesGet,
    useSaveProfileApiRotationProfilesPost,
    useApplyProfileApiRotationProfilesIdApplyPost,
    useDeleteProfileApiRotationProfilesIdDelete
} from '../../../api/generated/rotation-profiles/rotation-profiles';
import { useTriggerSkipApiRotationHistorySkipPost } from '../../../api/generated/rotation-history/rotation-history';
import type { MonitorInfo } from './useMonitors';

export interface ConfigState {
    mode: 'displayfusion' | 'native';
    interval: number;
    favProb: number;
    source: 'entire_library' | 'playlist';
    playlistId: string;
    style: 'fill' | 'fit' | 'stretch' | 'tile' | 'center' | 'span';
    overrideEnabled?: boolean;
    paused?: boolean;
}

export function useRotationConfig(monitors: MonitorInfo[]) {
    const { data: playlists } = useReadPlaylistsApiPlaylistsGet();
    const { data: dbSettings, refetch: refetchSettings } = useReadSettingsApiSettingsGet();

    const updateSetting = useUpdateSettingApiSettingsKeyPut();
    const skipMutation = useTriggerSkipApiRotationHistorySkipPost();

    const { data: profiles, refetch: refetchProfiles } = useListProfilesApiRotationProfilesGet();
    const saveProfileMutation = useSaveProfileApiRotationProfilesPost();
    const applyProfileMutation = useApplyProfileApiRotationProfilesIdApplyPost();
    const deleteProfileMutation = useDeleteProfileApiRotationProfilesIdDelete();

    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [newProfileName, setNewProfileName] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [applyingProfile, setApplyingProfile] = useState(false);
    const [deletingProfile, setDeletingProfile] = useState(false);

    const [globalConfig, setGlobalConfig] = useState<ConfigState>({
        mode: 'displayfusion',
        interval: 15,
        favProb: 40,
        source: 'entire_library',
        playlistId: '',
        style: 'fill',
        paused: false
    });

    const [monitorConfigs, setMonitorConfigs] = useState<Record<string, ConfigState>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (dbSettings) {
            const getVal = (key: string, def: string) => dbSettings.find(s => s.key === key)?.value || def;
            
            const gMode = getVal('wallpaper_rotation_mode', 'displayfusion') as 'displayfusion' | 'native';
            const gInt = parseInt(getVal('wallpaper_rotation_interval', '15'), 10) || 15;
            const gSrc = getVal('wallpaper_rotation_source', 'entire_library') as 'entire_library' | 'playlist';
            const gPlay = getVal('wallpaper_rotation_playlist_id', '');
            const gFav = Math.round(parseFloat(getVal('favorite_rotation_probability', '0.4')) * 100);
            const gStyle = getVal('wallpaper_rotation_style', 'fill') as ConfigState['style'];
            const gPaused = getVal('wallpaper_rotation_paused', 'false') === 'true';

            setGlobalConfig({
                mode: gMode,
                interval: gInt,
                source: gSrc,
                playlistId: gPlay,
                favProb: gFav,
                style: gStyle,
                paused: gPaused
            });

            const mConfigs: Record<string, ConfigState> = {};
            monitors.forEach((m) => {
                const idx = String(m.index);
                const overrideEnabled = getVal(`monitor_${idx}_override_enabled`, 'false') === 'true';

                mConfigs[idx] = {
                    overrideEnabled,
                    mode: (overrideEnabled ? getVal(`monitor_${idx}_wallpaper_rotation_mode`, gMode) : gMode) as 'displayfusion' | 'native',
                    interval: overrideEnabled ? (parseInt(getVal(`monitor_${idx}_wallpaper_rotation_interval`, String(gInt)), 10) || 15) : gInt,
                    source: (overrideEnabled ? getVal(`monitor_${idx}_wallpaper_rotation_source`, gSrc) : gSrc) as 'entire_library' | 'playlist',
                    playlistId: overrideEnabled ? getVal(`monitor_${idx}_wallpaper_rotation_playlist_id`, gPlay) : gPlay,
                    favProb: overrideEnabled ? (Math.round(parseFloat(getVal(`monitor_${idx}_favorite_rotation_probability`, String(gFav / 100))) * 100)) : gFav,
                    style: (overrideEnabled ? getVal(`monitor_${idx}_wallpaper_rotation_style`, gStyle) : gStyle) as ConfigState['style']
                };
            });
            setMonitorConfigs(mConfigs);
        }
    }, [dbSettings, monitors]);

    const handleTogglePause = async () => {
        const nextPaused = !globalConfig.paused;
        setGlobalConfig(prev => ({ ...prev, paused: nextPaused }));
        try {
            await updateSetting.mutateAsync({
                key: 'wallpaper_rotation_paused',
                data: { value: String(nextPaused), description: 'Global wallpaper rotation paused status' }
            });
            notifications.show({
                title: 'Success',
                message: nextPaused ? 'Wallpaper rotation paused' : 'Wallpaper rotation resumed',
                color: nextPaused ? 'orange' : 'green'
            });
            
            if (!nextPaused) {
                try {
                    await skipMutation.mutateAsync({
                        params: { target_monitor: 'all' }
                    });
                } catch {
                    // ignore
                }
            }
            refetchSettings();
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to update pause state', color: 'red' });
            setGlobalConfig(prev => ({ ...prev, paused: !nextPaused }));
        }
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        try {
            const promises = [
                updateSetting.mutateAsync({ key: 'wallpaper_rotation_mode', data: { value: globalConfig.mode, description: 'Global wallpaper rotation mode' } }),
                updateSetting.mutateAsync({ key: 'wallpaper_rotation_source', data: { value: globalConfig.source, description: 'Global wallpaper rotation source' } }),
                updateSetting.mutateAsync({ key: 'wallpaper_rotation_playlist_id', data: { value: globalConfig.playlistId, description: 'Global wallpaper rotation playlist ID' } }),
                updateSetting.mutateAsync({ key: 'favorite_rotation_probability', data: { value: String(globalConfig.favProb / 100), description: 'Global favorite rotation probability' } }),
                updateSetting.mutateAsync({ key: 'wallpaper_rotation_interval', data: { value: String(globalConfig.interval), description: 'Global wallpaper rotation interval' } }),
                updateSetting.mutateAsync({ key: 'wallpaper_rotation_style', data: { value: globalConfig.style, description: 'Global wallpaper rotation position style' } }),
                updateSetting.mutateAsync({ key: 'wallpaper_rotation_paused', data: { value: String(globalConfig.paused), description: 'Global wallpaper rotation paused status' } }),
            ];

            monitors.forEach((m) => {
                const idx = String(m.index);
                const conf = monitorConfigs[idx];
                if (conf) {
                    promises.push(updateSetting.mutateAsync({ key: `monitor_${idx}_override_enabled`, data: { value: String(conf.overrideEnabled), description: `Monitor ${idx} override status` } }));
                    if (conf.overrideEnabled) {
                        promises.push(updateSetting.mutateAsync({ key: `monitor_${idx}_wallpaper_rotation_mode`, data: { value: conf.mode, description: `Monitor ${idx} rotation mode` } }));
                        promises.push(updateSetting.mutateAsync({ key: `monitor_${idx}_wallpaper_rotation_source`, data: { value: conf.source, description: `Monitor ${idx} rotation source` } }));
                        promises.push(updateSetting.mutateAsync({ key: `monitor_${idx}_wallpaper_rotation_playlist_id`, data: { value: conf.playlistId, description: `Monitor ${idx} rotation playlist ID` } }));
                        promises.push(updateSetting.mutateAsync({ key: `monitor_${idx}_favorite_rotation_probability`, data: { value: String(conf.favProb / 100), description: `Monitor ${idx} favorite probability` } }));
                        promises.push(updateSetting.mutateAsync({ key: `monitor_${idx}_wallpaper_rotation_interval`, data: { value: String(conf.interval), description: `Monitor ${idx} rotation interval` } }));
                        promises.push(updateSetting.mutateAsync({ key: `monitor_${idx}_wallpaper_rotation_style`, data: { value: conf.style, description: `Monitor ${idx} rotation position style` } }));
                    }
                }
            });

            await Promise.all(promises);
            notifications.show({ title: 'Success', message: 'All rotation settings saved successfully', color: 'green' });
            
            try {
                await skipMutation.mutateAsync({
                    params: { target_monitor: 'all' }
                });
            } catch {
                // ignore
            }

            refetchSettings();
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to save settings', color: 'red' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveProfile = async () => {
        const nameClean = newProfileName.trim();
        if (!nameClean) {
            notifications.show({ title: 'Error', message: 'Profile name cannot be empty', color: 'red' });
            return;
        }

        setSavingProfile(true);
        try {
            await saveProfileMutation.mutateAsync({
                data: { name: nameClean }
            });
            notifications.show({ title: 'Success', message: `Profile '${nameClean}' saved successfully`, color: 'green' });
            setSaveModalOpen(false);
            setNewProfileName('');
            refetchProfiles();
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            const msg = error.response?.data?.detail || 'Failed to save profile';
            notifications.show({ title: 'Error', message: msg, color: 'red' });
        } finally {
            setSavingProfile(false);
        }
    };

    const handleApplyProfile = async () => {
        if (!selectedProfileId) {
            notifications.show({ title: 'Warning', message: 'Please select a profile to apply', color: 'yellow' });
            return;
        }

        setApplyingProfile(true);
        try {
            await applyProfileMutation.mutateAsync({
                id: parseInt(selectedProfileId, 10)
            });
            notifications.show({ title: 'Success', message: 'Profile settings applied successfully', color: 'green' });
            refetchSettings();
            
            try {
                await skipMutation.mutateAsync({
                    params: { target_monitor: 'all' }
                });
            } catch {
                // ignore
            }
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            const msg = error.response?.data?.detail || 'Failed to apply profile';
            notifications.show({ title: 'Error', message: msg, color: 'red' });
        } finally {
            setApplyingProfile(false);
        }
    };

    const handleDeleteProfile = async () => {
        if (!selectedProfileId) return;

        setDeletingProfile(true);
        try {
            await deleteProfileMutation.mutateAsync({
                id: parseInt(selectedProfileId, 10)
            });
            notifications.show({ title: 'Success', message: 'Profile deleted successfully', color: 'green' });
            setSelectedProfileId(null);
            refetchProfiles();
        } catch (err) {
            const error = err as { response?: { data?: { detail?: string } } };
            const msg = error.response?.data?.detail || 'Failed to delete profile';
            notifications.show({ title: 'Error', message: msg, color: 'red' });
        } finally {
            setDeletingProfile(false);
        }
    };

    return {
        playlists,
        dbSettings,
        globalConfig,
        setGlobalConfig,
        monitorConfigs,
        setMonitorConfigs,
        saving,
        profiles,
        selectedProfileId,
        setSelectedProfileId,
        saveModalOpen,
        setSaveModalOpen,
        newProfileName,
        setNewProfileName,
        savingProfile,
        applyingProfile,
        deletingProfile,
        handleTogglePause,
        handleSaveSettings,
        handleSaveProfile,
        handleApplyProfile,
        handleDeleteProfile
    };
}
