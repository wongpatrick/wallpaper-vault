/**
 * @file
 * Module: Creator Types and Platform Constants
 * Description: Type definitions and constants for creator social profiles.
 */

export const PLATFORM_OPTIONS = [
    { value: 'Twitter', label: 'Twitter/X' },
    { value: 'Pixiv', label: 'Pixiv' },
    { value: 'Patreon', label: 'Patreon' },
    { value: 'Fantia', label: 'Fantia' },
    { value: 'Bilibili', label: 'Bilibili' },
    { value: 'YouTube', label: 'YouTube' },
    { value: 'Custom', label: 'Custom/Website' }
];

export interface SocialLink {
    platform: string;
    url: string;
}
