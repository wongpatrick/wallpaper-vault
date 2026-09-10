/**
 * @file
 * Monitor layout and display coordinate synchronization service.
 * Aligns Electron displays with Windows physical monitors and handles native wallpaper operations.
 */
/* eslint-disable no-magic-numbers, @typescript-eslint/no-explicit-any */
import { screen } from 'electron';
import path from 'node:path';
import { logBothToCombined } from './appContext';
import { psDaemon, extractJsonArray } from './powerShellDaemon';

export interface OrderedDisplay {
    index: number;
    winNum: number;
    id: number;
    label: string;
    bounds: Electron.Rectangle;
}

let cachedOrderedDisplays: OrderedDisplay[] | null = null;
let cachedDisplayFingerprint: string | null = null;
let isPowerStateSuspended = false;
let pendingDisplayChange = false;

export function computeDisplayFingerprint(displays: Electron.Display[]): string {
    return displays
        .map(d => `${d.id}:${d.bounds.x},${d.bounds.y},${d.bounds.width},${d.bounds.height}:${d.scaleFactor}:${d.rotation}`)
        .sort()
        .join('|');
}

export function invalidateDisplayCache(): void {
    cachedOrderedDisplays = null;
    cachedDisplayFingerprint = null;
}

export function setPowerStateSuspended(suspended: boolean): void {
    isPowerStateSuspended = suspended;
}

export function getPowerStateSuspended(): boolean {
    return isPowerStateSuspended;
}

export function setPendingDisplayChange(pending: boolean): void {
    pendingDisplayChange = pending;
}

export function getPendingDisplayChange(): boolean {
    return pendingDisplayChange;
}

export async function getOrderedDisplays(forceRefresh = false): Promise<OrderedDisplay[]> {
    const displays = screen.getAllDisplays();
    const currentFingerprint = computeDisplayFingerprint(displays);

    const makeFallback = (): OrderedDisplay[] => displays.map((d, i) => ({
        index: i,
        winNum: i + 1,
        id: d.id,
        label: `Monitor ${i + 1} (${d.bounds.width}x${d.bounds.height})`,
        bounds: d.bounds
    }));

    if (isPowerStateSuspended) {
        console.log('[Monitor Layout] System is suspended. Returning fallback display layout.');
        return cachedOrderedDisplays || makeFallback();
    }

    if (!forceRefresh && cachedOrderedDisplays && cachedDisplayFingerprint === currentFingerprint) {
        return cachedOrderedDisplays;
    }

    if (cachedOrderedDisplays && cachedDisplayFingerprint !== currentFingerprint) {
        console.warn('[Monitor Layout] Display layout fingerprint mismatch. Invalidating monitor cache.');
        cachedOrderedDisplays = null;
        cachedDisplayFingerprint = null;
    }

    try {
        const [winRaw, comRaw] = await Promise.all([
            psDaemon.run('[WinDisplayHelper]::GetDisplays()'),
            psDaemon.run('[ComDisplayHelper]::GetLayout()')
        ]);

        const winDisplays: Array<{ winNum: number; x: number; y: number; w: number; h: number }> = JSON.parse(extractJsonArray(winRaw));
        const comDisplays: Array<{ comIndex: number; x: number; y: number; w: number; h: number }> = JSON.parse(extractJsonArray(comRaw));

        void logBothToCombined('[Monitor Layout] Electron displays: ' + JSON.stringify(displays.map(d => ({ id: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor }))));
        void logBothToCombined('[Monitor Layout] Windows displays: ' + JSON.stringify(winDisplays));
        void logBothToCombined('[Monitor Layout] COM displays: ' + JSON.stringify(comDisplays));

        // Match each Windows display to a COM display by physical coordinates (both use physical pixels)
        const winToComMap: Array<{ winNum: number; comIndex: number; x: number; y: number; w: number; h: number }> = [];
        for (const w of winDisplays) {
            let bestElectron: any = null;
            let minDist = Infinity;
            for (const d of displays) {
                const dist = Math.abs(w.x - d.bounds.x) + Math.abs(w.y - d.bounds.y);
                if (dist < minDist) {
                    minDist = dist;
                    bestElectron = d;
                }
            }

            const scale = bestElectron ? bestElectron.scaleFactor : 1.0;
            const physX = w.x * scale;
            const physY = w.y * scale;

            let bestCom: any = null;
            let minComDist = Infinity;
            for (const c of comDisplays) {
                const dist = Math.abs(physX - c.x) + Math.abs(physY - c.y);
                if (dist < minComDist) {
                    minComDist = dist;
                    bestCom = c;
                }
            }

            if (bestCom) {
                winToComMap.push({
                    winNum: w.winNum,
                    comIndex: bestCom.comIndex,
                    x: physX,
                    y: physY,
                    w: w.w * scale,
                    h: w.h * scale
                });
            }
        }

        void logBothToCombined('[Monitor Layout] Win-to-COM mapping: ' + JSON.stringify(winToComMap));

        // Match each mapped entry to an Electron display
        const ordered: OrderedDisplay[] = [];
        for (const mapping of winToComMap) {
            let bestElectron: any = null;
            let minDist = Infinity;
            for (const d of displays) {
                const physX = d.bounds.x * d.scaleFactor;
                const physY = d.bounds.y * d.scaleFactor;
                const dist = Math.abs(physX - mapping.x) + Math.abs(physY - mapping.y);
                if (dist < minDist) { minDist = dist; bestElectron = d; }
            }
            if (bestElectron && minDist < 1500) {
                ordered.push({
                    index: mapping.comIndex,
                    winNum: mapping.winNum,
                    id: bestElectron.id,
                    label: `Monitor ${mapping.winNum} (${bestElectron.bounds.width}x${bestElectron.bounds.height})`,
                    bounds: bestElectron.bounds
                });
            }
        }

        // Add any unmatched Electron displays as fallback
        displays.forEach(d => {
            if (!ordered.some(od => od.id === d.id)) {
                ordered.push({
                    index: ordered.length,
                    winNum: ordered.length + 1,
                    id: d.id,
                    label: `Monitor ${ordered.length + 1} (${d.bounds.width}x${d.bounds.height})`,
                    bounds: d.bounds
                });
            }
        });

        ordered.sort((a, b) => a.winNum - b.winNum);

        console.log('[Monitor Layout] Successfully aligned display indices with Windows OS settings:', ordered);
        cachedOrderedDisplays = ordered;
        cachedDisplayFingerprint = currentFingerprint;
        return ordered;
    } catch (err) {
        void logBothToCombined('[Monitor Layout] Failed to get Windows monitor layout, falling back to Electron defaults: ' + err);
        const fallback = makeFallback();
        cachedOrderedDisplays = fallback;
        cachedDisplayFingerprint = currentFingerprint;
        return fallback;
    }
}

export function getStyleInt(style: string): number {
    switch (style) {
        case 'center': return 0;
        case 'tile': return 1;
        case 'stretch': return 2;
        case 'fit': return 3;
        case 'fill': return 4;
        case 'span': return 5;
        default: return 4;
    }
}

export async function setWallpaperNatively(imagePath: string, monitorIndex: number, style: string): Promise<void> {
    const absolutePath = path.resolve(imagePath);
    const styleInt = getStyleInt(style);

    const base64Path = Buffer.from(absolutePath, 'utf-8').toString('base64');
    const cmd = `[WallpaperHelper]::SetMonitorWallpaper(${monitorIndex}, [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${base64Path}")), ${styleInt})`;

    console.log(`[Monitor Layout] Calling PowerShell daemon to set wallpaper for Monitor ${monitorIndex === -1 ? 'Global' : monitorIndex + 1} with Style ${style}...`);
    try {
        await psDaemon.run(cmd);
        console.log('[Monitor Layout] Natively set wallpaper succeeded.');
    } catch (err) {
        console.error('[Monitor Layout] PowerShell wallpaper update failed:', err);
        throw err;
    }
}

export async function getSystemWallpapers(): Promise<Array<{ comIndex: number; wallpaper: string }>> {
    try {
        const stdout = await psDaemon.run('[WallpaperHelper]::GetPaths()');
        return JSON.parse(extractJsonArray(stdout));
    } catch (err) {
        console.error('[Monitor Layout] Failed to get system wallpapers:', err);
        return [];
    }
}
