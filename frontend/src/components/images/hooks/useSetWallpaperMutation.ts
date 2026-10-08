/**
 * @file
 * Module: useSetWallpaperMutation Hook
 * Description: Manages target display selection, fit style preferences, Electron IPC / REST fallback, and wallpaper application mutation.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { IconCheck } from '@tabler/icons-react';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import { useMonitors } from '../../../pages/rotation/hooks/useMonitors';
import { useSetActiveWallpaperApiRotationHistorySetWallpaperPost } from '../../../api/generated/rotation-history/rotation-history';
import type { Image as ImageModel, SetWallpaperRequestStyle } from '../../../api/model';

const FIT_STYLE_STORAGE_PREFIX = 'wallpaper_fit_style_';
const NOTIFICATION_AUTO_CLOSE_MS = 3000;
const ERROR_AUTO_CLOSE_MS = 4000;
const DEFAULT_PREVIEW_WIDTH = 1920;
const DEFAULT_PREVIEW_HEIGHT = 1080;

export interface UseSetWallpaperMutationOptions {
    image: ImageModel | null;
    opened?: boolean;
    onSuccess?: () => void;
}

export function useSetWallpaperMutation({
    image,
    opened = true,
    onSuccess
}: UseSetWallpaperMutationOptions) {
    const { showNotification } = useAppNotifications();
    const { monitors } = useMonitors();
    const setWallpaperMutation = useSetActiveWallpaperApiRotationHistorySetWallpaperPost();
    const [isApplying, setIsApplying] = useState(false);

    // Target display selection: 'all' or monitor index string ('0', '1', etc.)
    const [targetMonitor, setTargetMonitor] = useState<string>('0');
    const [fitStyle, setFitStyle] = useState<NonNullable<SetWallpaperRequestStyle>>('fill');

    // Initialize or reset selected monitor when modal opens
    useEffect(() => {
        if (opened) {
            if (monitors.length > 0) {
                setTargetMonitor((prev) => {
                    if (prev !== 'all' && monitors.some(m => String(m.index) === prev)) {
                        const savedStyle = (localStorage.getItem(FIT_STYLE_STORAGE_PREFIX + prev) as NonNullable<SetWallpaperRequestStyle>) || 'fill';
                        setFitStyle(savedStyle);
                        return prev;
                    }
                    if (prev === 'all') {
                        const savedStyle = (localStorage.getItem(FIT_STYLE_STORAGE_PREFIX + 'all') as NonNullable<SetWallpaperRequestStyle>) || 'fill';
                        setFitStyle(savedStyle);
                        return 'all';
                    }
                    const defaultIndex = String(monitors[0].index);
                    const savedStyle = (localStorage.getItem(FIT_STYLE_STORAGE_PREFIX + defaultIndex) as NonNullable<SetWallpaperRequestStyle>) || 'fill';
                    setFitStyle(savedStyle);
                    return defaultIndex;
                });
            } else if (!window.electron) {
                setTargetMonitor('all');
                const savedStyle = (localStorage.getItem(FIT_STYLE_STORAGE_PREFIX + 'all') as NonNullable<SetWallpaperRequestStyle>) || 'fill';
                setFitStyle(savedStyle);
            }
        }
    }, [opened, monitors]);

    const handleSelectTarget = useCallback((target: string) => {
        setTargetMonitor(target);
        const savedStyle = (localStorage.getItem(FIT_STYLE_STORAGE_PREFIX + target) as NonNullable<SetWallpaperRequestStyle>) || 'fill';
        setFitStyle(savedStyle);
    }, []);

    const handleFitStyleChange = useCallback((val: string) => {
        const styleVal = (val || 'fill') as NonNullable<SetWallpaperRequestStyle>;
        setFitStyle(styleVal);
        localStorage.setItem(FIT_STYLE_STORAGE_PREFIX + targetMonitor, styleVal);
    }, [targetMonitor]);

    const selectedMonitorObj = useMemo(() => {
        return monitors.find(m => String(m.index) === targetMonitor);
    }, [monitors, targetMonitor]);

    const targetLabel = useMemo(() => {
        if (targetMonitor === 'all') return 'All Displays (Global)';
        return `Monitor ${selectedMonitorObj?.winNum || (parseInt(targetMonitor, 10) + 1)}`;
    }, [targetMonitor, selectedMonitorObj]);

    const handleApply = useCallback(async () => {
        if (!image) return;
        setIsApplying(true);
        try {
            const monitorIndex = targetMonitor === 'all' ? -1 : parseInt(targetMonitor, 10);

            if (window.electron?.setWallpaper) {
                const res = await window.electron.setWallpaper(image.id, monitorIndex, fitStyle);
                if (res && res.success === false) {
                    throw new Error(res.error || 'Failed to set wallpaper natively');
                }
            } else {
                // Fallback to REST API in web mode
                await setWallpaperMutation.mutateAsync({
                    data: {
                        image_id: image.id,
                        target_monitor: targetMonitor,
                        style: fitStyle
                    }
                });
            }

            localStorage.setItem(FIT_STYLE_STORAGE_PREFIX + targetMonitor, fitStyle);

            showNotification({
                title: 'Wallpaper Applied',
                message: `Set "${image.filename}" on ${targetLabel} (${fitStyle})`,
                color: 'green',
                icon: React.createElement(IconCheck, { size: 16 }),
                autoClose: NOTIFICATION_AUTO_CLOSE_MS
            });

            onSuccess?.();
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            showNotification({
                title: 'Failed to Set Wallpaper',
                message: errorMsg,
                color: 'red',
                autoClose: ERROR_AUTO_CLOSE_MS
            });
        } finally {
            setIsApplying(false);
        }
    }, [image, targetMonitor, fitStyle, targetLabel, setWallpaperMutation, showNotification, onSuccess]);

    const previewWidth = selectedMonitorObj ? selectedMonitorObj.bounds.width : DEFAULT_PREVIEW_WIDTH;
    const previewHeight = selectedMonitorObj ? selectedMonitorObj.bounds.height : DEFAULT_PREVIEW_HEIGHT;
    const previewRatio = previewWidth / previewHeight;

    const getPreviewImageStyle = useCallback(() => {
        switch (fitStyle) {
            case 'fit':
                return { width: '100%', height: '100%', objectFit: 'contain' as const };
            case 'stretch':
                return { width: '100%', height: '100%', objectFit: 'fill' as const };
            case 'center':
                return { maxWidth: '100%', maxHeight: '100%', objectFit: 'none' as const };
            case 'span':
                return { width: '100%', height: '100%', objectFit: 'cover' as const };
            case 'fill':
            default:
                return { width: '100%', height: '100%', objectFit: 'cover' as const };
        }
    }, [fitStyle]);

    return {
        monitors,
        targetMonitor,
        fitStyle,
        isApplying,
        selectedMonitorObj,
        targetLabel,
        previewWidth,
        previewHeight,
        previewRatio,
        getPreviewImageStyle,
        handleSelectTarget,
        handleFitStyleChange,
        handleApply
    };
}
