/**
 * @file Multi-monitor grid layout component.
 */
/* eslint-disable no-magic-numbers */
import { useMemo } from 'react';
import { Box, Text, Tooltip } from '@mantine/core';
import { IconLink } from '@tabler/icons-react';
import { getImageUrl } from '../../../utils/fileUtils';
import type { MonitorInfo } from '../hooks/useMonitors';
import type { ConfigState } from '../hooks/useRotationConfig';
import type { ImageDetail } from '../../../api/model';

interface MonitorGridProps {
    monitors: MonitorInfo[];
    monitorConfigs: Record<string, ConfigState>;
    activeMonitorPreview: string;
    setActiveMonitorPreview: (val: string) => void;
    systemWallpapers: Array<{ comIndex: number; wallpaper: string }>;
    activeWallpapers: Record<string, ImageDetail>;
    currentMonitors: Record<string, ImageDetail> | undefined;
    dbSettings: Array<{ key: string; value: string }> | undefined;
    currentImage: ImageDetail | undefined;
    resolveImageFromPath: (path: string) => number | null;
}

export function MonitorGrid({
    monitors,
    monitorConfigs,
    activeMonitorPreview,
    setActiveMonitorPreview,
    systemWallpapers,
    activeWallpapers,
    currentMonitors,
    dbSettings,
    currentImage,
    resolveImageFromPath,
}: MonitorGridProps) {
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

        return { minX, minY, totalWidth, totalHeight };
    }, [monitors]);

    const getMonitorThumbnail = (monitorIndex: number) => {
        const sysWallpaper = systemWallpapers.find(w => w.comIndex === monitorIndex);
        if (sysWallpaper && sysWallpaper.wallpaper) {
            const resolvedId = resolveImageFromPath(sysWallpaper.wallpaper);
            if (resolvedId) {
                return getImageUrl(resolvedId);
            }
        }

        const monitorKey = String(monitorIndex);
        const active = activeWallpapers[monitorKey];
        if (active) return getImageUrl(active.id, active.phash || active.file_size || undefined);
        
        if (currentMonitors && currentMonitors[monitorKey]) {
            const img = currentMonitors[monitorKey];
            return getImageUrl(img.id, img.phash || img.file_size || undefined);
        }

        const activeImgId = dbSettings?.find(s => s.key === `monitor_${monitorIndex}_active_image_id`)?.value;
        if (activeImgId) {
            return getImageUrl(activeImgId);
        }
        
        if (currentMonitors && currentMonitors['global']) {
            const img = currentMonitors['global'];
            return getImageUrl(img.id, img.phash || img.file_size || undefined);
        }

        const globalImgId = dbSettings?.find(s => s.key === 'wallpaper_active_image_id')?.value;
        if (globalImgId) {
            return getImageUrl(globalImgId);
        }
        
        if (currentImage) {
            return getImageUrl(currentImage.id, currentImage.phash || currentImage.file_size || undefined);
        }
        
        return null;
    };

    if (monitors.length === 0 || !monitorLayout) {
        return null;
    }

    return (
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
    );
}
