/**
 * @file
 * Byte formatting utility.
 * Formats numeric byte sizes into human-readable strings (e.g., 1.5 GB).
 */

/**
 * Formats a number of bytes into a human-readable string (e.g. 1.2 GB).
 *
 * @param bytes The raw number of bytes
 * @param decimals Number of decimal digits to round to (default 2)
 */
export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes < 0) return 'Invalid size';
    if (bytes === 0) return '0 Bytes';
    if (bytes < 1) return `${bytes.toFixed(decimals)} Bytes`;

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const sizeName = sizes[i] || 'YB';
    const value = sizes[i] ? bytes / Math.pow(k, i) : bytes / Math.pow(k, sizes.length - 1);

    return parseFloat(value.toFixed(dm)) + ' ' + sizeName;
}
