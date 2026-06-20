/**
 * @file
 * Utility functions for handling file operations and URLs.
 * Provides helpers for drag-and-drop, file sizes, and generating backend image URLs.
 */
import { AXIOS_INSTANCE } from "../api/axios-instance";
import { API_BASE_URL } from "../config";

/**
 * Generates the full URL for an image file served by the backend.
 * @param imageId The ID of the image in the database.
 * @returns A string URL to be used in src attributes.
 */
export const getImageUrl = (imageId: number | string | undefined | null, cacheBuster?: string | number): string => {
    if (!imageId) return 'https://placehold.co/600x400?text=No+Image';
    
    const baseURL = AXIOS_INSTANCE.defaults.baseURL || API_BASE_URL;
    const url = `${baseURL}/api/images/file/${imageId}`;
    return cacheBuster ? `${url}?cb=${cacheBuster}` : url;
};

/**
 * Generates the URL for a resized thumbnail of an image.
 * @param imageId The ID of the image in the database.
 * @param size 'sm' (200px wide) or 'md' (400px wide).
 * @param cacheBuster Optional query parameter value to bypass cached images when files change.
 * @returns A string URL for the thumbnail.
 */
export const getThumbnailUrl = (
    imageId: number | string | undefined | null, 
    size: 'sm' | 'md' | 'lg' = 'sm',
    cacheBuster?: string | number
): string => {
    if (!imageId) return 'https://placehold.co/600x400?text=No+Image';
    
    const baseURL = AXIOS_INSTANCE.defaults.baseURL || API_BASE_URL;
    const url = `${baseURL}/api/images/thumb/${imageId}?size=${size}`;
    return cacheBuster ? `${url}&cb=${cacheBuster}` : url;
};

/**
 * A standard fallback image for when a set has no images.
 */
export const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1000&auto=format&fit=crop';

/**
 * Recursively gets all files from a FileSystemEntry (drag and drop).
 */
export async function getAllFiles(entry: FileSystemEntry): Promise<string[]> {
    const files: string[] = [];
    
    async function readEntry(e: FileSystemEntry, path = "") {
        if (e.isFile) {
            const fileEntry = e as FileSystemFileEntry;
            const file = await new Promise<File>((resolve) => fileEntry.file(resolve));
            // Only include common image extensions
            if (/\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(file.name)) {
                files.push(path ? `${path}/${file.name}` : file.name);
            }
        } else if (e.isDirectory) {
            const dirEntry = e as FileSystemDirectoryEntry;
            const reader = dirEntry.createReader();
            const entries = await new Promise<FileSystemEntry[]>((resolve) => {
                reader.readEntries(resolve);
            });
            for (const subEntry of entries) {
                await readEntry(subEntry, path ? `${path}/${e.name}` : e.name);
            }
        }
    }
    
    // If it's the root directory being dropped, we don't want the root name in the path
    if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const reader = dirEntry.createReader();
        const entries = await new Promise<FileSystemEntry[]>((resolve) => {
            reader.readEntries(resolve);
        });
        for (const subEntry of entries) {
            await readEntry(subEntry, "");
        }
    } else {
        await readEntry(entry, "");
    }
    
    return files;
}

/**
 * Formats a number of bytes into a human-readable string (e.g. 1.2 GB).
 */
export function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

