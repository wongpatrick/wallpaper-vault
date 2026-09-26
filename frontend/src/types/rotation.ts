/**
 * @file
 * Module: Rotation Rule Types and Constants
 * Description: Type definitions and constants for wallpaper rotation rules and scheduling.
 */
import type { RotationRule } from '../api/model/rotationRule';
export type { RotationRule };

export type RuleSource = 'entire_library' | 'playlist';
export type WallpaperStyle = 'fill' | 'fit' | 'stretch' | 'center' | 'span';

export const DAYS = [
    { label: 'Monday', value: '1' },
    { label: 'Tuesday', value: '2' },
    { label: 'Wednesday', value: '3' },
    { label: 'Thursday', value: '4' },
    { label: 'Friday', value: '5' },
    { label: 'Saturday', value: '6' },
    { label: 'Sunday', value: '7' }
];

export const MONTHS = [
    { label: 'Jan', value: '01' }, { label: 'Feb', value: '02' },
    { label: 'Mar', value: '03' }, { label: 'Apr', value: '04' },
    { label: 'May', value: '05' }, { label: 'Jun', value: '06' },
    { label: 'Jul', value: '07' }, { label: 'Aug', value: '08' },
    { label: 'Sep', value: '09' }, { label: 'Oct', value: '10' },
    { label: 'Nov', value: '11' }, { label: 'Dec', value: '12' }
];

export function formatDays(daysCsv?: string | null): string {
    if (!daysCsv) return 'Every Day';
    const indices = daysCsv.split(',');
    const labels = indices.map(idx => DAYS.find(d => d.value === idx)?.label.slice(0, 3));
    return labels.join(', ');
}

export interface PlaylistOption {
    id: number;
    name: string;
}

export type RuleFormData = {
    name: string;
    enabled: number;
    source: RuleSource;
    playlist_id?: number | null;
    style?: WallpaperStyle | null;
    start_date?: string | null;
    end_date?: string | null;
    days_of_week?: string | null;
    start_time?: string | null;
    end_time?: string | null;
};
