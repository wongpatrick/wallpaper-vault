/* eslint-disable no-magic-numbers */
/**
 * @file
 * Module: Desktop Rotation Manager Page
 * Description: Control center for desktop wallpaper rotation settings, active wallpaper monitoring, quick actions (favorite/blacklist), history, and native/DisplayFusion options with multi-monitor override support.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Title,
    Text,
    Container,
    SimpleGrid,
    Paper,
    Group,
    Stack,
    Button,
    Card,
    Image,
    Badge,
    Slider,
    Select,
    NumberInput,
    Loader,
    Center,
    Alert,
    Box,
    ActionIcon,
    Tooltip,
    Tabs,
    Switch
} from '@mantine/core';
import {
    IconStar,
    IconStarFilled,
    IconBan,
    IconPlayerSkipForward,
    IconSettings,
    IconAlertCircle,
    IconInfoCircle,
    IconPhoto,
    IconDeviceDesktop,
    IconLink
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {
    useReadCurrentWallpaperApiRotationHistoryCurrentGet,
    useReadWallpaperHistoryApiRotationHistoryHistoryGet,
    useTriggerSkipApiRotationHistorySkipPost,
    useReadCurrentMonitorsWallpapersApiRotationHistoryCurrentMonitorsGet
} from '../../api/generated/rotation-history/rotation-history';
import { useReadSettingsApiSettingsGet, useUpdateSettingApiSettingsKeyPut } from '../../api/generated/settings/settings';
import { useReadPlaylistsApiPlaylistsGet } from '../../api/generated/playlists/playlists';
import { useUpdateImageApiImagesImageIdPatch } from '../../api/generated/images/images';
import { getImageUrl } from '../../utils/fileUtils';
import { API_BASE_URL } from '../../config';
import { Link, useLocation } from 'react-router-dom';
import type { ImageDetail } from '../../api/model';

interface MonitorInfo {
    index: number;
    winNum?: number;
    id: number;
    label: string;
    bounds: { width: number; height: number; x: number; y: number; };
}

interface ConfigState {
    mode: 'displayfusion' | 'native';
    interval: number;
    favProb: number;
    source: 'entire_library' | 'playlist';
    playlistId: string;
    style: 'fill' | 'fit' | 'stretch' | 'tile' | 'center' | 'span';
    overrideEnabled?: boolean;
}

export default function RotationManagement() {
    const location = useLocation();

    // 1. Query monitors from Electron
    const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
    useEffect(() => {
        if (window.electron?.getMonitors) {
            window.electron.getMonitors().then((res) => {
                setMonitors(res);
            });
        }
    }, []);

    // 2. Fetch Current Wallpaper & History
    const { data: currentImage, isLoading: currentLoading, refetch: refetchCurrent } = 
        useReadCurrentWallpaperApiRotationHistoryCurrentGet({
            query: { retry: false }
        });
        
    const { data: historyList, isLoading: historyLoading, refetch: refetchHistory } = 
        useReadWallpaperHistoryApiRotationHistoryHistoryGet();

    const { data: currentMonitors, refetch: refetchCurrentMonitors } = 
        useReadCurrentMonitorsWallpapersApiRotationHistoryCurrentMonitorsGet();

    // 3. Fetch Playlists & Settings
    const { data: playlists } = useReadPlaylistsApiPlaylistsGet();
    const { data: dbSettings, refetch: refetchSettings } = useReadSettingsApiSettingsGet();

    // Mutations
    const skipMutation = useTriggerSkipApiRotationHistorySkipPost();
    const updateImageMutation = useUpdateImageApiImagesImageIdPatch();
    const updateSetting = useUpdateSettingApiSettingsKeyPut();

    // Active configuration tab
    const [activeConfigTab, setActiveConfigTab] = useState<string>('global');

    // Monitor focus preview selector: 'all', '0', '1', '2' etc.
    const [activeMonitorPreview, setActiveMonitorPreview] = useState<string>('all');

    // Currently focused image details (defaults to active monitor or history item clicked)
    const [selectedImageId, setSelectedImageId] = useState<number | null>(null);

    // Track active wallpaper per monitor index dynamically via SSE broadcasts
    const [activeWallpapers, setActiveWallpapers] = useState<Record<string, ImageDetail>>({});

    // Track active system wallpapers directly queried from Windows OS
    const [systemWallpapers, setSystemWallpapers] = useState<Array<{ comIndex: number; wallpaper: string }>>([]);

    const resolveImageFromPath = useCallback((pathStr: string) => {
        if (!pathStr) return null;
        
        // 1. Check if it's our native temp file pattern: wallpaper-vault-active-monitor-X-id-Y.jpg
        const idMatch = pathStr.match(/-id-(\d+)\.jpg$/i);
        if (idMatch) {
            return parseInt(idMatch[1], 10);
        }
        
        // 2. Extract filename from the path
        const filename = pathStr.split(/[/\\]/).pop();
        if (!filename) return null;
        
        // 3. Search in currentImage and historyList
        if (currentImage) {
            if (currentImage.filename === filename || currentImage.local_path?.replace(/\\/g, '/').endsWith(filename)) {
                return currentImage.id;
            }
        }
        
        if (historyList) {
            const found = historyList.find(img => img.filename === filename || img.local_path?.replace(/\\/g, '/').endsWith(filename));
            if (found) return found.id;
        }
        
        // 4. Try matching numerical filename as image ID (common in temp files)
        const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
        if (/^\d+$/.test(nameWithoutExt)) {
            const parsedId = parseInt(nameWithoutExt, 10);
            if (currentImage && currentImage.id === parsedId) return currentImage.id;
            if (historyList?.some(img => img.id === parsedId)) return parsedId;
        }
        
        return null;
    }, [currentImage, historyList]);

    const fetchSystemWallpapers = useCallback(async () => {
        if (window.electron?.getSystemWallpapers) {
            try {
                const paths = await window.electron.getSystemWallpapers();
                setSystemWallpapers(paths);
            } catch (err) {
                console.error('[Rotation Management] Failed to fetch system wallpapers:', err);
            }
        }
    }, []);

    useEffect(() => {
        fetchSystemWallpapers();
        const interval = setInterval(fetchSystemWallpapers, 5000);
        return () => clearInterval(interval);
    }, [fetchSystemWallpapers]);

    // Form inputs states
    const [globalConfig, setGlobalConfig] = useState<ConfigState>({
        mode: 'displayfusion',
        interval: 15,
        favProb: 40,
        source: 'entire_library',
        playlistId: '',
        style: 'fill'
    });

    const [monitorConfigs, setMonitorConfigs] = useState<Record<string, ConfigState>>({});
    const [saving, setSaving] = useState(false);

    // Sync database settings with local state
    useEffect(() => {
        if (dbSettings) {
            const getVal = (key: string, def: string) => dbSettings.find(s => s.key === key)?.value || def;
            
            // 1. Sync Global Configurations
            const gMode = getVal('wallpaper_rotation_mode', 'displayfusion') as 'displayfusion' | 'native';
            const gInt = parseInt(getVal('wallpaper_rotation_interval', '15'), 10) || 15;
            const gSrc = getVal('wallpaper_rotation_source', 'entire_library') as 'entire_library' | 'playlist';
            const gPlay = getVal('wallpaper_rotation_playlist_id', '');
            const gFav = Math.round(parseFloat(getVal('favorite_rotation_probability', '0.4')) * 100);
            const gStyle = getVal('wallpaper_rotation_style', 'fill') as any;

            setGlobalConfig({
                mode: gMode,
                interval: gInt,
                source: gSrc,
                playlistId: gPlay,
                favProb: gFav,
                style: gStyle
            });

            // 2. Sync monitor-specific overrides
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
                    style: (overrideEnabled ? getVal(`monitor_${idx}_wallpaper_rotation_style`, gStyle) : gStyle) as any
                };
            });
            setMonitorConfigs(mConfigs);
        }
    }, [dbSettings, monitors]);

    // SSE Event Listener for real-time rotation sync
    useEffect(() => {
        const eventSource = new EventSource(`${API_BASE_URL}/api/rotation-history/events`);
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'rotation' || data.event === 'ping') {
                    refetchCurrent();
                    refetchHistory();
                    refetchCurrentMonitors();
                    if (data.event === 'rotation') {
                        // Update active wallpaper for specific monitor target
                        const target = data.target_monitor || 'all';
                        setActiveWallpapers(prev => ({
                            ...prev,
                            [target]: data.image
                        }));
                        fetchSystemWallpapers();
                    }
                }
            } catch {
                // ignore parsing errors
            }
        };

        return () => {
            eventSource.close();
        };
    }, [refetchCurrent, refetchHistory, refetchCurrentMonitors, fetchSystemWallpapers]);

    // Determine the active wallpaper image to show in the preview card
    const activeWallpaper = useMemo(() => {
        if (activeMonitorPreview === 'all') {
            if (currentMonitors && currentMonitors['global']) return currentMonitors['global'];
            
            const globalImgId = dbSettings?.find(s => s.key === 'wallpaper_active_image_id')?.value;
            if (globalImgId) {
                const imgId = parseInt(globalImgId, 10);
                if (currentImage && currentImage.id === imgId) return currentImage;
                const found = historyList?.find(img => img.id === imgId);
                if (found) return found;
            }
            return currentImage;
        }

        const monitorIdxNum = parseInt(activeMonitorPreview, 10);

        // 1. Try to resolve the image using the OS-level wallpaper path directly
        const sysWallpaper = systemWallpapers.find(w => w.comIndex === monitorIdxNum);
        if (sysWallpaper && sysWallpaper.wallpaper) {
            const resolvedId = resolveImageFromPath(sysWallpaper.wallpaper);
            if (resolvedId) {
                if (currentImage && currentImage.id === resolvedId) return currentImage;
                const found = historyList?.find(img => img.id === resolvedId);
                if (found) return found;

                // Fallback: If not in history or currentImage, check if it's the active one in currentMonitors
                if (currentMonitors) {
                    const monitorImg = currentMonitors[activeMonitorPreview];
                    if (monitorImg && monitorImg.id === resolvedId) return monitorImg;
                    const globalImg = currentMonitors['global'];
                    if (globalImg && globalImg.id === resolvedId) return globalImg;
                }
            }
        }

        // 2. Fallback: Try real-time active wallpapers from SSE
        const active = activeWallpapers[activeMonitorPreview];
        if (active) return active;

        // 3. Fallback: Check monitor-specific active image from our API
        if (currentMonitors && currentMonitors[activeMonitorPreview]) {
            return currentMonitors[activeMonitorPreview];
        }

        // 4. Fallback: Check monitor-specific database settings directly (offline/before API loads)
        const activeImgId = dbSettings?.find(s => s.key === `monitor_${activeMonitorPreview}_active_image_id`)?.value;
        if (activeImgId) {
            const imgId = parseInt(activeImgId, 10);
            if (currentImage && currentImage.id === imgId) return currentImage;
            const found = historyList?.find(img => img.id === imgId);
            if (found) return found;
        }

        // 5. Fallback: Check global active image from API
        if (currentMonitors && currentMonitors['global']) {
            return currentMonitors['global'];
        }

        // 6. Fallback: Check global active image in database
        const globalImgId = dbSettings?.find(s => s.key === 'wallpaper_active_image_id')?.value;
        if (globalImgId) {
            const imgId = parseInt(globalImgId, 10);
            if (currentImage && currentImage.id === imgId) return currentImage;
            const found = historyList?.find(img => img.id === imgId);
            if (found) return found;
        }

        return currentImage;
    }, [activeMonitorPreview, activeWallpapers, currentImage, dbSettings, historyList, currentMonitors, systemWallpapers, resolveImageFromPath]);

    // Find the currently focused image details
    const focusedImage = useMemo(() => {
        if (selectedImageId === null) return activeWallpaper;
        if (activeWallpaper && activeWallpaper.id === selectedImageId) return activeWallpaper;
        return historyList?.find(img => img.id === selectedImageId) || activeWallpaper;
    }, [selectedImageId, activeWallpaper, historyList]);

    // Handle skip/rotate request for selected preview target
    const handleSkip = async () => {
        try {
            await skipMutation.mutateAsync({
                params: { target_monitor: activeMonitorPreview }
            });
            notifications.show({ title: 'Success', message: 'Skip command sent successfully', color: 'green' });
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to send skip command', color: 'red' });
        }
    };

    // Toggle favorite status for focused image
    const handleToggleFavorite = async () => {
        if (!focusedImage) return;
        try {
            const nextFav = !focusedImage.is_favorite;
            await updateImageMutation.mutateAsync({
                imageId: focusedImage.id,
                data: { is_favorite: nextFav }
            });
            notifications.show({ 
                title: 'Success', 
                message: nextFav ? 'Marked as Favorite' : 'Removed from Favorites', 
                color: 'green' 
            });
            refetchCurrent();
            refetchHistory();
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to update image details', color: 'red' });
        }
    };

    // Blacklist focused image
    const handleBlacklist = async () => {
        if (!focusedImage) return;
        try {
            await updateImageMutation.mutateAsync({
                imageId: focusedImage.id,
                data: { is_blacklisted: true }
            });
            notifications.show({ 
                title: 'Success', 
                message: 'Wallpaper blacklisted (excluded from future rotations)', 
                color: 'orange' 
            });
            setSelectedImageId(null);
            refetchCurrent();
            refetchHistory();
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to blacklist image', color: 'red' });
        }
    };

    // Save configurations
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
            
            // Trigger skip immediately to apply the new wallpapers
            try {
                await skipMutation.mutateAsync({
                    params: { target_monitor: 'all' }
                });
            } catch {
                // ignore trigger failure
            }

            refetchSettings();
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to save settings', color: 'red' });
        } finally {
            setSaving(false);
        }
    };

    const playlistData = useMemo(() => {
        return playlists?.map(p => ({ value: String(p.id), label: p.name })) || [];
    }, [playlists]);

    const activeBorderColor = focusedImage?.dominant_color || '#3b82f6';

    const monitorLayout = useMemo(() => {
        if (monitors.length === 0) return null;

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        monitors.forEach(m => {
            const { x, y, width, height } = m.bounds;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + width > maxX) maxX = x + width;
            if (y + height > maxY) maxY = y + height;
        });

        const totalWidth = maxX - minX || 1;
        const totalHeight = maxY - minY || 1;

        return {
            minX,
            minY,
            totalWidth,
            totalHeight
        };
    }, [monitors]);

    const getMonitorThumbnail = (monitorIndex: number) => {
        // 0. Try to resolve the image using the OS-level wallpaper path directly
        const sysWallpaper = systemWallpapers.find(w => w.comIndex === monitorIndex);
        if (sysWallpaper && sysWallpaper.wallpaper) {
            const resolvedId = resolveImageFromPath(sysWallpaper.wallpaper);
            if (resolvedId) {
                return getImageUrl(resolvedId);
            }
        }

        const monitorKey = String(monitorIndex);

        // 1. Fallback: Try to use real-time SSE event state
        const active = activeWallpapers[monitorKey];
        if (active) return getImageUrl(active.id, active.phash || active.file_size || undefined);
        
        // 2. Fallback: Check monitor-specific active image from our API
        if (currentMonitors && currentMonitors[monitorKey]) {
            const img = currentMonitors[monitorKey];
            return getImageUrl(img.id, img.phash || img.file_size || undefined);
        }

        // 3. Fallback: Check monitor-specific database settings directly (offline/before API loads)
        const activeImgId = dbSettings?.find(s => s.key === `monitor_${monitorIndex}_active_image_id`)?.value;
        if (activeImgId) {
            return getImageUrl(activeImgId);
        }
        
        // 4. Fallback: Check global active image from API
        if (currentMonitors && currentMonitors['global']) {
            const img = currentMonitors['global'];
            return getImageUrl(img.id, img.phash || img.file_size || undefined);
        }

        // 5. Fallback: Check global active image in database
        const globalImgId = dbSettings?.find(s => s.key === 'wallpaper_active_image_id')?.value;
        if (globalImgId) {
            return getImageUrl(globalImgId);
        }
        
        // 6. Fallback: Check currentImage
        if (currentImage) {
            return getImageUrl(currentImage.id, currentImage.phash || currentImage.file_size || undefined);
        }
        
        return null;
    };



    // Resolve configuration values for the currently active tab
    const activeTabConfig = useMemo((): ConfigState => {
        if (activeConfigTab === 'global') return globalConfig;
        return monitorConfigs[activeConfigTab] || {
            mode: 'displayfusion',
            interval: 15,
            favProb: 40,
            source: 'entire_library',
            playlistId: '',
            style: 'fill',
            overrideEnabled: false
        };
    }, [activeConfigTab, globalConfig, monitorConfigs]);

    // Helper to update active tab configurations
    const updateActiveTabConfig = (updates: Partial<ConfigState>) => {
        if (activeConfigTab === 'global') {
            setGlobalConfig(prev => ({ ...prev, ...updates }));
        } else {
            setMonitorConfigs(prev => ({
                ...prev,
                [activeConfigTab]: {
                    ...prev[activeConfigTab],
                    ...updates
                }
            }));
        }
    };

    return (
        <Container size="xl" py="md">
            <Stack gap="xl">
                <Box>
                    <Title order={1} mb={4}>🖥️ Desktop Rotation Manager</Title>
                    <Text c="dimmed">Monitor active wallpapers, trigger skips, and customize rotation pools per screen.</Text>
                </Box>

                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
                    {/* LEFT COLUMN: Active wallpaper display & History */}
                    <Stack gap="md">
                        <Group justify="space-between" align="center">
                            <Title order={3}>Active Wallpaper</Title>
                            {monitors.length > 0 && (
                                <Button 
                                    size="xs" 
                                    variant={activeMonitorPreview === 'all' ? 'filled' : 'light'} 
                                    color="blue"
                                    onClick={() => setActiveMonitorPreview('all')}
                                >
                                    Global View
                                </Button>
                            )}
                        </Group>

                        {/* Monitor Layout Map */}
                        {monitors.length > 0 && monitorLayout && (
                            <Box 
                                style={{ 
                                    backgroundColor: '#141517', 
                                    borderRadius: '8px', 
                                    padding: '16px',
                                    border: '1px solid #2e2f34',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    height: '192px'
                                }}
                            >
                                <Box 
                                    style={{ 
                                        position: 'relative', 
                                        height: '100%', 
                                        width: 'auto',
                                        maxWidth: '100%',
                                        aspectRatio: `${monitorLayout.totalWidth} / ${monitorLayout.totalHeight}`
                                    }}
                                >
                                    {monitors.map((m) => {
                                        const left = ((m.bounds.x - monitorLayout.minX) / monitorLayout.totalWidth) * 100;
                                        const top = ((m.bounds.y - monitorLayout.minY) / monitorLayout.totalHeight) * 100;
                                        const w = (m.bounds.width / monitorLayout.totalWidth) * 100;
                                        const h = (m.bounds.height / monitorLayout.totalHeight) * 100;
                                        
                                        const thumbnailUrl = getMonitorThumbnail(m.index);
                                        const conf = monitorConfigs[String(m.index)];
                                        const isLinked = !conf || !conf.overrideEnabled;
                                        const isFocused = activeMonitorPreview === String(m.index);
                                        
                                        return (
                                            <Box
                                                key={m.index}
                                                onClick={() => setActiveMonitorPreview(String(m.index))}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${left}%`,
                                                    top: `${top}%`,
                                                    width: `${w}%`,
                                                    height: `${h}%`,
                                                    cursor: 'pointer',
                                                    border: isFocused ? '3px solid #22c55e' : '1px solid #374151',
                                                    borderRadius: '6px',
                                                    overflow: 'hidden',
                                                    transition: 'all 0.2s ease',
                                                    backgroundColor: '#1a1b1e',
                                                    boxShadow: isFocused ? '0 0 12px rgba(34, 197, 94, 0.5)' : 'none'
                                                }}
                                            >
                                                {thumbnailUrl ? (
                                                    <img 
                                                        src={thumbnailUrl} 
                                                        alt={`Monitor ${m.winNum || (m.index + 1)}`}
                                                        style={{
                                                            width: '100%',
                                                            height: '100%',
                                                            objectFit: 'cover',
                                                            opacity: isFocused ? 1.0 : 0.75
                                                        }}
                                                    />
                                                ) : (
                                                    <Box style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1b1e' }}>
                                                        <Text size="xs" c="dimmed">No Image</Text>
                                                    </Box>
                                                )}
                                                
                                                {/* Monitor Number Overlay */}
                                                <Text 
                                                    style={{
                                                        position: 'absolute',
                                                        left: '8px',
                                                        top: '50%',
                                                        transform: 'translateY(-50%)',
                                                        fontSize: '2rem',
                                                        fontWeight: 'bold',
                                                        color: 'white',
                                                        lineHeight: 1,
                                                        userSelect: 'none',
                                                        pointerEvents: 'none',
                                                        textShadow: '0px 0px 4px black, -1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black, 1px 1px 0 black'
                                                    }}
                                                >
                                                    {m.winNum || (m.index + 1)}
                                                </Text>
                                                
                                                {/* Linked Status Icon */}
                                                {isLinked && (
                                                    <Tooltip label="Inheriting Global Settings" position="top">
                                                        <Box 
                                                            style={{ 
                                                                position: 'absolute', 
                                                                top: '6px', 
                                                                right: '6px', 
                                                                backgroundColor: 'rgba(0, 0, 0, 0.65)', 
                                                                borderRadius: '50%', 
                                                                padding: '4px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                zIndex: 2
                                                            }}
                                                        >
                                                            <IconLink size="0.8rem" color="#60a5fa" />
                                                        </Box>
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        );
                                    })}
                                </Box>
                            </Box>
                        )}
                        
                        {currentLoading ? (
                            <Paper withBorder p="xl" radius="md">
                                <Center h={300}>
                                    <Loader size="lg" />
                                </Center>
                            </Paper>
                        ) : focusedImage ? (
                            <Card 
                                withBorder 
                                radius="md" 
                                p={0}
                                style={{
                                    transition: 'all 0.3s ease',
                                    border: `2px solid ${activeBorderColor}`,
                                    boxShadow: `0 0 20px ${activeBorderColor}26`
                                }}
                            >
                                <Card.Section pos="relative">
                                    <Image 
                                        src={getImageUrl(focusedImage.id, focusedImage.phash || focusedImage.file_size || undefined)}
                                        fallbackSrc="https://placehold.co/600x350?text=No+Wallpaper+Active"
                                        alt="Current wallpaper"
                                        height={320}
                                        fit="cover"
                                    />
                                    {focusedImage.id === activeWallpaper?.id && (
                                        <Badge 
                                            color="blue" 
                                            variant="filled" 
                                            pos="absolute" 
                                            top={16} 
                                            left={16}
                                        >
                                            {activeMonitorPreview === 'all' ? 'Active' : `Active on Monitor ${Number(activeMonitorPreview) + 1}`}
                                        </Badge>
                                    )}
                                </Card.Section>

                                <Stack p="md" gap="md">
                                    <Group justify="space-between" align="center">
                                        <Box style={{ flex: 1 }}>
                                            <Tooltip label={focusedImage.filename}>
                                                <Text fw={600} size="lg" truncate="end" maw={350}>
                                                    {focusedImage.filename}
                                                </Text>
                                            </Tooltip>
                                            <Text size="xs" c="dimmed">
                                                ID: {focusedImage.id} • {focusedImage.width}x{focusedImage.height}
                                            </Text>
                                        </Box>
                                        <Badge color="teal" variant="light">
                                            {focusedImage.aspect_ratio_label}
                                        </Badge>
                                    </Group>

                                    <Group justify="space-between">
                                        <Group gap="xs">
                                            <Button 
                                                variant={focusedImage.is_favorite ? "filled" : "outline"}
                                                color="yellow"
                                                onClick={handleToggleFavorite}
                                                leftSection={focusedImage.is_favorite ? <IconStarFilled size="1rem" /> : <IconStar size="1rem" />}
                                            >
                                                Favorite
                                            </Button>
                                            <Button 
                                                variant="outline" 
                                                color="red"
                                                onClick={handleBlacklist}
                                                leftSection={<IconBan size="1rem" />}
                                            >
                                                Blacklist
                                            </Button>
                                        </Group>

                                        <Group gap="xs">
                                            <Button
                                                component={Link}
                                                to={`/sets/${focusedImage.set_id}`}
                                                state={{ from: location.pathname, fromLabel: 'Rotation' }}
                                                variant="light"
                                                leftSection={<IconPhoto size="1rem" />}
                                            >
                                                View Set
                                            </Button>
                                            <Tooltip label="Skip / Load next wallpaper">
                                                <ActionIcon 
                                                    size="lg" 
                                                    color="blue" 
                                                    variant="filled"
                                                    onClick={handleSkip}
                                                    loading={skipMutation.isPending}
                                                >
                                                    <IconPlayerSkipForward size="1.2rem" />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    </Group>
                                </Stack>
                            </Card>
                        ) : (
                            <Paper withBorder p="xl" radius="md">
                                <Center h={300}>
                                    <Stack align="center" gap="xs">
                                        <IconAlertCircle size="2.5rem" color="gray" />
                                        <Text c="dimmed">No rotation logs found. Serve a random image first.</Text>
                                    </Stack>
                                </Center>
                            </Paper>
                        )}

                        {/* Recent History strip */}
                        <Stack gap="xs" mt="sm">
                            <Text fw={600} size="sm">Recently Active Wallpapers</Text>
                            {historyLoading ? (
                                <Center py="md"><Loader variant="dots" /></Center>
                            ) : !historyList || historyList.length === 0 ? (
                                <Text size="xs" c="dimmed">No recent wallpapers recorded.</Text>
                            ) : (
                                <Group gap="xs" wrap="nowrap" style={{ overflowX: 'auto', paddingBottom: 5 }}>
                                    {historyList.map((img) => (
                                        <Tooltip key={img.id} label={img.filename}>
                                            <Paper
                                                withBorder
                                                radius="sm"
                                                p={2}
                                                style={{
                                                    cursor: 'pointer',
                                                    border: focusedImage?.id === img.id ? '2px solid #3b82f6' : '1px solid var(--mantine-color-default-border)',
                                                    transition: 'transform 0.2s ease',
                                                    flexShrink: 0
                                                }}
                                                onClick={() => setSelectedImageId(img.id)}
                                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                            >
                                                <Image 
                                                    src={getImageUrl(img.id, img.phash || img.file_size || undefined)}
                                                    w={80}
                                                    h={50}
                                                    radius="sm"
                                                    fit="cover"
                                                    fallbackSrc="https://placehold.co/80x50?text=Hist"
                                                />
                                            </Paper>
                                        </Tooltip>
                                    ))}
                                </Group>
                            )}
                            {selectedImageId !== null && (
                                <Button 
                                    variant="subtle" 
                                    size="xs" 
                                    onClick={() => setSelectedImageId(null)}
                                    style={{ alignSelf: 'flex-start' }}
                                >
                                    Back to Active Wallpaper
                                </Button>
                            )}
                        </Stack>
                    </Stack>

                    {/* RIGHT COLUMN: Configuration overrides panel */}
                    <Stack gap="md">
<Title order={3}>Rotation Configurations</Title>

                        <Paper withBorder p="md" radius="md">
                            <Tabs value={activeConfigTab} onChange={(val) => setActiveConfigTab(val || 'global')}>
                                <Tabs.List mb="md">
                                    <Tabs.Tab value="global" leftSection={<IconSettings size="0.8rem" />}>Global</Tabs.Tab>
                                    {monitors.map(m => (
                                        <Tabs.Tab key={m.index} value={String(m.index)} leftSection={<IconDeviceDesktop size="0.8rem" />}>
                                            Monitor {m.winNum || (m.index + 1)}
                                        </Tabs.Tab>
                                    ))}
                                </Tabs.List>

                                {activeConfigTab !== 'global' && (
                                    <Switch
                                        label={`Override global rotation rules for Monitor ${(() => {
                                            const activeMon = monitors.find(mon => String(mon.index) === activeConfigTab);
                                            return activeMon?.winNum || (Number(activeConfigTab) + 1);
                                        })()}`}
                                        checked={!!activeTabConfig.overrideEnabled}
                                        onChange={(event) => updateActiveTabConfig({ overrideEnabled: event.currentTarget.checked })}
                                        mb="md"
                                    />
                                )}

                                <Stack gap="md" style={{ opacity: activeConfigTab === 'global' || activeTabConfig.overrideEnabled ? 1 : 0.5, pointerEvents: activeConfigTab === 'global' || activeTabConfig.overrideEnabled ? 'all' : 'none' }}>
                                    <Select 
                                        label="Rotation Mode"
                                        description="Coordinate with DisplayFusion or update Windows backgrounds natively."
                                        data={[
                                            { value: 'displayfusion', label: 'DisplayFusion CLI Integration' },
                                            { value: 'native', label: 'Native Windows Changer' }
                                        ]}
                                        value={activeTabConfig.mode}
                                        onChange={(val) => { if (val) updateActiveTabConfig({ mode: val as 'displayfusion' | 'native' }); }}
                                    />

                                    {activeTabConfig.mode === 'native' && (
                                        <Select 
                                            label="Wallpaper Sizing & Style"
                                            description={activeConfigTab === 'global' 
                                                ? "Choose how the image is scaled and positioned on the screen." 
                                                : "Windows natively forces a global wallpaper style. Change this on the Global tab."}
                                            disabled={activeConfigTab !== 'global'}
                                            data={[
                                                { value: 'fill', label: 'Fill (Crop to aspect ratio)' },
                                                { value: 'fit', label: 'Fit (Letterbox/Pillarbox)' },
                                                { value: 'stretch', label: 'Stretch (Ignore aspect ratio)' },
                                                { value: 'tile', label: 'Tile (Repeat image)' },
                                                { value: 'center', label: 'Center (No scaling)' },
                                                { value: 'span', label: 'Span (Stretch single image across monitors)' }
                                            ]}
                                            value={activeTabConfig.style}
                                            onChange={(val) => { if (val) updateActiveTabConfig({ style: val as any }); }}
                                        />
                                    )}

                                    <Select 
                                        label="Rotation Source Pool"
                                        description="Select whether to rotate from the entire library or a targeted playlist."
                                        data={[
                                            { value: 'entire_library', label: 'Entire Wallpaper Vault Library' },
                                            { value: 'playlist', label: 'Curated Playlist' }
                                        ]}
                                        value={activeTabConfig.source}
                                        onChange={(val) => { if (val) updateActiveTabConfig({ source: val as 'entire_library' | 'playlist' }); }}
                                    />

                                    {activeTabConfig.source === 'playlist' && (
                                        <Select 
                                            label="Target Playlist"
                                            description="Select which playlist should be active for rotations."
                                            data={playlistData}
                                            value={activeTabConfig.playlistId}
                                            onChange={(val) => updateActiveTabConfig({ playlistId: val || '' })}
                                            placeholder="Choose a playlist..."
                                        />
                                    )}

                                    <Box>
                                        <Group justify="space-between" mb={2}>
                                            <Text size="sm" fw={500}>Favorite Wallpaper Probability</Text>
                                            <Badge color="yellow">{activeTabConfig.favProb}%</Badge>
                                        </Group>
                                        <Text size="xs" c="dimmed" mb="xs">
                                            The probability that a favorite image is selected instead of a regular wallpaper.
                                        </Text>
                                        <Slider 
                                            value={activeTabConfig.favProb}
                                            onChange={(val) => updateActiveTabConfig({ favProb: val })}
                                            min={0}
                                            max={100}
                                            step={5}
                                            marks={[
                                                { value: 0, label: '0%' },
                                                { value: 40, label: '40% (Def)' },
                                                { value: 100, label: '100%' }
                                            ]}
                                            mb="lg"
                                        />
                                    </Box>

                                    <NumberInput 
                                        label="Native Rotation Interval"
                                        description="Interval in minutes for background rotations (only active in Native mode)."
                                        min={1}
                                        max={1440}
                                        value={activeTabConfig.interval}
                                        onChange={(val) => updateActiveTabConfig({ interval: Number(val) || 15 })}
                                        disabled={activeTabConfig.mode !== 'native'}
                                    />

                                    {activeTabConfig.mode === 'displayfusion' && (
                                        <Alert 
                                            icon={<IconInfoCircle size="1rem" />} 
                                            color="blue" 
                                            variant="light"
                                            styles={{ title: { fontWeight: 600 } }}
                                            title="DisplayFusion CLI Configuration"
                                        >
                                            DisplayFusion is currently driving the interval schedule. To change rotation intervals, please adjust your DisplayFusion monitor settings.
                                        </Alert>
                                    )}

                                    {activeTabConfig.mode === 'native' && (
                                        <Alert 
                                            icon={<IconInfoCircle size="1rem" />} 
                                            color="blue" 
                                            variant="light"
                                            styles={{ title: { fontWeight: 600 } }}
                                            title="Auto-Detect Monitor Orientation"
                                        >
                                            Rotations automatically request wallpapers matching your monitor's orientation (Landscape screens fetch landscape images like 16:9 or 16:10, and Portrait screens fetch portrait images).
                                        </Alert>
                                    )}
                                </Stack>
                            </Tabs>

                            <Button 
                                color="blue" 
                                onClick={handleSaveSettings}
                                loading={saving}
                                leftSection={<IconSettings size="1rem" />}
                                mt="xl"
                                fullWidth
                            >
                                Save All Configurations
                            </Button>
                        </Paper>
                    </Stack>
                </SimpleGrid>
            </Stack>
        </Container>
    );
}
