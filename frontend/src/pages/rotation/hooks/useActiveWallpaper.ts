/**
 * @file Active wallpaper and SSE hook for rotation management.
 */
/* eslint-disable no-magic-numbers */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import {
    useReadCurrentWallpaperApiRotationHistoryCurrentGet,
    useReadWallpaperHistoryApiRotationHistoryHistoryGet,
    useTriggerSkipApiRotationHistorySkipPost,
    useReadCurrentMonitorsWallpapersApiRotationHistoryCurrentMonitorsGet
} from '../../../api/generated/rotation-history/rotation-history';
import { useUpdateImageApiImagesImageIdPatch } from '../../../api/generated/images/images';
import { API_BASE_URL } from '../../../config';
import { AXIOS_INSTANCE } from '../../../api/axios-instance';
import type { ImageDetail } from '../../../api/model';
import type { MonitorInfo } from './useMonitors';

export function useActiveWallpaper(monitors: MonitorInfo[], activeMonitorPreview: string) {
    const { data: currentImage, isLoading: currentLoading, refetch: refetchCurrent } = 
        useReadCurrentWallpaperApiRotationHistoryCurrentGet(undefined, {
            query: { retry: false }
        });
        
    const { data: historyList, isLoading: historyLoading, refetch: refetchHistory } = 
        useReadWallpaperHistoryApiRotationHistoryHistoryGet();

    const { data: currentMonitors, refetch: refetchCurrentMonitors } = 
        useReadCurrentMonitorsWallpapersApiRotationHistoryCurrentMonitorsGet();

    const skipMutation = useTriggerSkipApiRotationHistorySkipPost();
    const updateImageMutation = useUpdateImageApiImagesImageIdPatch();

    const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
    const [activeWallpapers, setActiveWallpapers] = useState<Record<string, ImageDetail>>({});
    const [systemWallpapers, setSystemWallpapers] = useState<Array<{ comIndex: number; wallpaper: string }>>([]);

    const resolveImageFromPath = useCallback((pathStr: string) => {
        if (!pathStr) return null;
        
        const idMatch = pathStr.match(/-id-(\d+)\.jpg$/i);
        if (idMatch) {
            return parseInt(idMatch[1], 10);
        }
        
        const filename = pathStr.split(/[/\\]/).pop();
        if (!filename) return null;
        
        if (currentImage) {
            if (currentImage.filename === filename || currentImage.local_path?.replace(/\\/g, '/').endsWith(filename)) {
                return currentImage.id;
            }
        }
        
        if (historyList) {
            const found = historyList.find(img => img.filename === filename || img.local_path?.replace(/\\/g, '/').endsWith(filename));
            if (found) return found.id;
        }
        
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
        let isMounted = true;
        if (window.electron?.getSystemWallpapers) {
            window.electron.getSystemWallpapers().then((paths) => {
                if (isMounted) setSystemWallpapers(paths);
            }).catch(() => {});
        }
        const interval = setInterval(() => {
            fetchSystemWallpapers();
        }, 5000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [fetchSystemWallpapers]);

    useEffect(() => {
        const baseURL = localStorage.getItem('backend_url') || AXIOS_INSTANCE.defaults.baseURL || API_BASE_URL;
        const token = localStorage.getItem('api_key') || '';
        const url = new URL(`${baseURL}/api/rotation-history/events`);
        if (token) {
            url.searchParams.append('api_key', token);
        }
        const eventSource = new EventSource(url.toString());
        
        eventSource.onerror = () => {
            console.error('SSE connection failed in rotation.tsx. Closing EventSource to prevent retry loops.');
            eventSource.close();
        };
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'rotation' || data.event === 'ping') {
                    refetchCurrent();
                    refetchHistory();
                    refetchCurrentMonitors();
                    if (data.event === 'rotation') {
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

    const activeWallpaper = useMemo(() => {
        if (activeMonitorPreview === 'all') {
            const primaryMonitor = monitors.find(m => m.bounds.x === 0 && m.bounds.y === 0) || monitors.find(m => m.winNum === 1);
            const primaryIdx = primaryMonitor ? String(primaryMonitor.index) : '0';

            const primaryIdxNum = parseInt(primaryIdx, 10);
            const sysWp = systemWallpapers.find(w => w.comIndex === primaryIdxNum);
            if (sysWp && sysWp.wallpaper) {
                const resolvedId = resolveImageFromPath(sysWp.wallpaper);
                if (resolvedId) {
                    if (currentImage && currentImage.id === resolvedId) return currentImage;
                    const found = historyList?.find(img => img.id === resolvedId);
                    if (found) return found;
                    if (currentMonitors) {
                        const monitorImg = currentMonitors[primaryIdx];
                        if (monitorImg && monitorImg.id === resolvedId) return monitorImg;
                        const globalImg = currentMonitors['global'];
                        if (globalImg && globalImg.id === resolvedId) return globalImg;
                    }
                }
            }

            const primaryActive = activeWallpapers[primaryIdx];
            if (primaryActive) return primaryActive;

            if (currentMonitors && currentMonitors[primaryIdx]) {
                return currentMonitors[primaryIdx];
            }

            if (currentMonitors && currentMonitors['global']) return currentMonitors['global'];
            return currentImage;
        }

        const monitorIdxNum = parseInt(activeMonitorPreview, 10);

        const sysWallpaper = systemWallpapers.find(w => w.comIndex === monitorIdxNum);
        if (sysWallpaper && sysWallpaper.wallpaper) {
            const resolvedId = resolveImageFromPath(sysWallpaper.wallpaper);
            if (resolvedId) {
                if (currentImage && currentImage.id === resolvedId) return currentImage;
                const found = historyList?.find(img => img.id === resolvedId);
                if (found) return found;

                if (currentMonitors) {
                    const monitorImg = currentMonitors[activeMonitorPreview];
                    if (monitorImg && monitorImg.id === resolvedId) return monitorImg;
                    const globalImg = currentMonitors['global'];
                    if (globalImg && globalImg.id === resolvedId) return globalImg;
                }
            }
        }

        const active = activeWallpapers[activeMonitorPreview];
        if (active) return active;

        if (currentMonitors && currentMonitors[activeMonitorPreview]) {
            return currentMonitors[activeMonitorPreview];
        }

        if (currentMonitors && currentMonitors['global']) {
            return currentMonitors['global'];
        }

        return currentImage;
    }, [activeMonitorPreview, activeWallpapers, currentImage, historyList, currentMonitors, systemWallpapers, resolveImageFromPath, monitors]);

    const focusedImage = useMemo(() => {
        if (selectedImageId === null) return activeWallpaper;
        if (activeWallpaper && activeWallpaper.id === selectedImageId) return activeWallpaper;
        return historyList?.find(img => img.id === selectedImageId) || activeWallpaper;
    }, [selectedImageId, activeWallpaper, historyList]);

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

    return {
        currentImage,
        currentLoading,
        historyList,
        historyLoading,
        currentMonitors,
        activeWallpapers,
        systemWallpapers,
        selectedImageId,
        setSelectedImageId,
        activeWallpaper,
        focusedImage,
        handleSkip,
        handleToggleFavorite,
        handleBlacklist,
        refetchCurrent,
        refetchHistory,
        refetchCurrentMonitors,
        resolveImageFromPath
    };
}
