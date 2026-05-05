import { AXIOS_INSTANCE } from "../api/axios-instance";

/**
 * Generates the full URL for an image file served by the backend.
 * @param imageId The ID of the image in the database.
 * @returns A string URL to be used in src attributes.
 */
export const getImageUrl = (imageId: number | string | undefined | null): string => {
    if (!imageId) return 'https://placehold.co/600x400?text=No+Image';
    
    const baseURL = AXIOS_INSTANCE.defaults.baseURL || 'http://localhost:8000';
    return `${baseURL}/api/images/file/${imageId}`;
};

/**
 * A standard fallback image for when a set has no images.
 */
export const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1000&auto=format&fit=crop';

/**
 * Recursively gets all files from a FileSystemEntry (drag and drop).
 */
export async function getAllFiles(entry: any): Promise<string[]> {
    const files: string[] = [];
    
    async function readEntry(e: any, path = "") {
        if (e.isFile) {
            const file = await new Promise<File>((resolve) => e.file(resolve));
            // Only include common image extensions
            if (/\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(file.name)) {
                files.push(path ? `${path}/${file.name}` : file.name);
            }
        } else if (e.isDirectory) {
            const reader = e.createReader();
            const entries = await new Promise<any[]>((resolve) => {
                reader.readEntries(resolve);
            });
            for (const subEntry of entries) {
                await readEntry(subEntry, path ? `${path}/${e.name}` : e.name);
            }
        }
    }
    
    // If it's the root directory being dropped, we don't want the root name in the path
    if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = await new Promise<any[]>((resolve) => {
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

