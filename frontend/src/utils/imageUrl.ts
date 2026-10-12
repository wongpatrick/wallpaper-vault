/**
 * @file
 * Utility functions for generating backend image and thumbnail URLs.
 */
import { AXIOS_INSTANCE } from '../api/axios-instance';
import { API_BASE_URL } from '../config';

/**
 * A standard fallback image for when a set has no images.
 */
export const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1000&auto=format&fit=crop';

/**
 * Generates the full URL for an image file served by the backend.
 * @param imageId The ID of the image in the database.
 * @param cacheBuster Optional query parameter value to bypass cached images when files change.
 * @param baseUrlOverride Optional backend base URL to override the default active vault.
 * @param apiKeyOverride Optional API key to override the default active vault.
 * @returns A string URL to be used in src attributes.
 */
export const getImageUrl = (
    imageId: number | string | undefined | null,
    cacheBuster?: string | number,
    baseUrlOverride?: string,
    apiKeyOverride?: string
): string => {
    if (!imageId) return 'https://placehold.co/600x400?text=No+Image';

    const baseURL = (baseUrlOverride ? baseUrlOverride.replace(/\/+$/, '') : null) || localStorage.getItem('backend_url') || AXIOS_INSTANCE.defaults.baseURL || API_BASE_URL;
    const token = apiKeyOverride !== undefined ? apiKeyOverride : (localStorage.getItem('api_key') || '');
    let url = `${baseURL}/api/images/file/${imageId}`;
    const params: string[] = [];
    if (cacheBuster) params.push(`cb=${cacheBuster}`);
    if (token) params.push(`token=${encodeURIComponent(token)}`);
    if (params.length > 0) {
        url += `?${params.join('&')}`;
    }
    return url;
};

/**
 * Generates the URL for a resized thumbnail of an image.
 * @param imageId The ID of the image in the database.
 * @param size 'sm' (200px wide), 'md' (400px wide), or 'lg'.
 * @param cacheBuster Optional query parameter value to bypass cached images when files change.
 * @param baseUrlOverride Optional backend base URL to override the default active vault.
 * @param apiKeyOverride Optional API key to override the default active vault.
 * @returns A string URL for the thumbnail.
 */
export const getThumbnailUrl = (
    imageId: number | string | undefined | null,
    size: 'sm' | 'md' | 'lg' = 'sm',
    cacheBuster?: string | number,
    baseUrlOverride?: string,
    apiKeyOverride?: string
): string => {
    if (!imageId) return 'https://placehold.co/600x400?text=No+Image';

    const baseURL = (baseUrlOverride ? baseUrlOverride.replace(/\/+$/, '') : null) || localStorage.getItem('backend_url') || AXIOS_INSTANCE.defaults.baseURL || API_BASE_URL;
    const token = apiKeyOverride !== undefined ? apiKeyOverride : (localStorage.getItem('api_key') || '');
    let url = `${baseURL}/api/images/thumb/${imageId}`;
    const params: string[] = [`size=${size}`];
    if (cacheBuster) params.push(`cb=${cacheBuster}`);
    if (token) params.push(`token=${encodeURIComponent(token)}`);
    url += `?${params.join('&')}`;
    return url;
};
