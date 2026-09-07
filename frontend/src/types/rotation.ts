/**
 * @file
 * Module: Rotation Rule Types and Constants
 * Description: Type definitions and constants for wallpaper rotation rules and scheduling.
 */

export interface RotationRule {
    id: number;
    name: string;
    priority: number;
    enabled: number;
    start_date?: string; // MM-DD
    end_date?: string;   // MM-DD
    days_of_week?: string; // Comma separated (e.g. "1,2,3")
    start_time?: string; // HH:MM
    end_time?: string;   // HH:MM
    source: string; // "entire_library" or "playlist"
    playlist_id?: number;
    style?: string; // "fill", "fit", "stretch", "center", "span"
}

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

export function formatDays(daysCsv?: string): string {
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
    source: string;
    playlist_id?: number;
    style?: string;
    start_date?: string;
    end_date?: string;
    days_of_week?: string;
    start_time?: string;
    end_time?: string;
};
