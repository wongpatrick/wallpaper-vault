/**
 * @file
 * Unit tests for fileUtils.ts.
 * Verifies URL generation, file size formatting, and drag-and-drop file resolution.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getImageUrl, getThumbnailUrl, formatBytes, getAllFiles, FALLBACK_IMAGE } from './fileUtils';
import { AXIOS_INSTANCE } from '../api/axios-instance';
import { API_BASE_URL } from '../config';

describe('fileUtils', () => {
    let originalBaseURL: string | undefined;

    beforeEach(() => {
        originalBaseURL = AXIOS_INSTANCE.defaults.baseURL;
    });

    afterEach(() => {
        AXIOS_INSTANCE.defaults.baseURL = originalBaseURL;
    });

    describe('getImageUrl', () => {
        it('should return fallback image when imageId is falsy', () => {
            expect(getImageUrl(undefined)).toBe('https://placehold.co/600x400?text=No+Image');
            expect(getImageUrl(null)).toBe('https://placehold.co/600x400?text=No+Image');
            expect(getImageUrl('')).toBe('https://placehold.co/600x400?text=No+Image');
            expect(getImageUrl(0)).toBe('https://placehold.co/600x400?text=No+Image');
        });

        it('should generate URL with API_BASE_URL if AXIOS_INSTANCE baseURL is not set', () => {
            AXIOS_INSTANCE.defaults.baseURL = undefined;
            expect(getImageUrl(123)).toBe(`${API_BASE_URL}/api/images/file/123`);
        });

        it('should generate URL with AXIOS_INSTANCE baseURL if it is set', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getImageUrl(123)).toBe('http://custom-api.local/api/images/file/123');
        });

        it('should append cacheBuster parameter if provided', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getImageUrl(123, 'buster')).toBe('http://custom-api.local/api/images/file/123?cb=buster');
            expect(getImageUrl(123, 999)).toBe('http://custom-api.local/api/images/file/123?cb=999');
        });
    });

    describe('getThumbnailUrl', () => {
        it('should return fallback image when imageId is falsy', () => {
            expect(getThumbnailUrl(undefined)).toBe('https://placehold.co/600x400?text=No+Image');
            expect(getThumbnailUrl(null)).toBe('https://placehold.co/600x400?text=No+Image');
        });

        it('should generate thumbnail URL with default size sm', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getThumbnailUrl(123)).toBe('http://custom-api.local/api/images/thumb/123?size=sm');
        });

        it('should generate thumbnail URL with specified size', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getThumbnailUrl(123, 'md')).toBe('http://custom-api.local/api/images/thumb/123?size=md');
            expect(getThumbnailUrl(123, 'lg')).toBe('http://custom-api.local/api/images/thumb/123?size=lg');
        });

        it('should append cacheBuster parameter if provided', () => {
            AXIOS_INSTANCE.defaults.baseURL = 'http://custom-api.local';
            expect(getThumbnailUrl(123, 'sm', 'buster')).toBe('http://custom-api.local/api/images/thumb/123?size=sm&cb=buster');
        });
    });

    describe('FALLBACK_IMAGE', () => {
        it('should export a valid Unsplash placeholder URL', () => {
            expect(FALLBACK_IMAGE).toBeTypeOf('string');
            expect(FALLBACK_IMAGE).toContain('unsplash.com');
        });
    });

    describe('formatBytes', () => {
        it('should return Invalid size for negative values', () => {
            expect(formatBytes(-10)).toBe('Invalid size');
            expect(formatBytes(-12345)).toBe('Invalid size');
        });

        it('should return 0 Bytes for 0', () => {
            expect(formatBytes(0)).toBe('0 Bytes');
        });

        it('should format fractional sizes between 0 and 1 correctly', () => {
            expect(formatBytes(0.5)).toBe('0.50 Bytes');
            expect(formatBytes(0.123, 3)).toBe('0.123 Bytes');
        });

        it('should format bytes correctly', () => {
            expect(formatBytes(500)).toBe('500 Bytes');
        });

        it('should format kilobytes correctly with default 2 decimals', () => {
            expect(formatBytes(1024)).toBe('1 KB');
            expect(formatBytes(1536)).toBe('1.5 KB');
            expect(formatBytes(12345)).toBe('12.06 KB');
        });

        it('should respect custom decimals', () => {
            expect(formatBytes(12345, 1)).toBe('12.1 KB');
            expect(formatBytes(12345, 0)).toBe('12 KB');
        });

        it('should default negative decimals to 0', () => {
            expect(formatBytes(12345, -1)).toBe('12 KB');
        });

        it('should format megabytes, gigabytes and larger sizes correctly', () => {
            expect(formatBytes(1024 * 1024)).toBe('1 MB');
            expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
            expect(formatBytes(Math.pow(1024, 4))).toBe('1 TB');
        });

        it('should handle sizes exceeding YB (Yottabytes) safely', () => {
            expect(formatBytes(Math.pow(1024, 10))).toBe('1048576 YB');
        });
    });

    describe('getAllFiles', () => {
        // Helpers to construct mock FileSystemEntry trees
        function createMockFileEntry(name: string): FileSystemFileEntry {
            return {
                isFile: true,
                isDirectory: false,
                name,
                file: (callback: (f: File) => void, errorCallback?: (e: Error) => void) => {
                    if (name === 'error.png' && errorCallback) {
                        errorCallback(new Error('Permission denied'));
                    } else {
                        callback({ name } as File);
                    }
                }
            } as unknown as FileSystemFileEntry;
        }

        function createMockDirectoryEntry(name: string, children: FileSystemEntry[]): FileSystemDirectoryEntry {
            return {
                isFile: false,
                isDirectory: true,
                name,
                createReader: () => {
                    let yielded = false;
                    return {
                        readEntries: (callback: (entries: FileSystemEntry[]) => void) => {
                            if (!yielded) {
                                yielded = true;
                                callback(children);
                            } else {
                                callback([]);
                            }
                        }
                    };
                }
            } as unknown as FileSystemDirectoryEntry;
        }

        it('should return a single file if a valid image file entry is provided', async () => {
            const fileEntry = createMockFileEntry('test-image.png');
            const result = await getAllFiles(fileEntry);
            expect(result).toEqual(['test-image.png']);
        });

        it('should return an empty list if a non-image file entry is provided', async () => {
            const fileEntry = createMockFileEntry('notes.txt');
            const result = await getAllFiles(fileEntry);
            expect(result).toEqual([]);
        });

        it('should recursively find all image files in a directory hierarchy', async () => {
            const img1 = createMockFileEntry('wallpaper1.jpg');
            const img2 = createMockFileEntry('wallpaper2.PNG');
            const textDoc = createMockFileEntry('info.txt');
            const img3 = createMockFileEntry('nested-pic.webp');
            const subSubImg = createMockFileEntry('deep-pic.avif');

            const subSubDir = createMockDirectoryEntry('deep', [subSubImg]);
            const subDir = createMockDirectoryEntry('subdir', [img3, subSubDir]);
            const rootDir = createMockDirectoryEntry('root', [img1, img2, textDoc, subDir]);

            const result = await getAllFiles(rootDir);
            expect(result).toEqual([
                'wallpaper1.jpg',
                'wallpaper2.PNG',
                'subdir/nested-pic.webp',
                'subdir/deep/deep-pic.avif'
            ]);
        });

        it('should safely handle and skip files that fail to load', async () => {
            const img1 = createMockFileEntry('img1.png');
            const errImg = createMockFileEntry('error.png');
            const dir = createMockDirectoryEntry('root', [img1, errImg]);
            const result = await getAllFiles(dir);
            expect(result).toEqual(['img1.png']);
        });

        it('should handle paginated directory entry readings', async () => {
            const img1 = createMockFileEntry('img1.png');
            const img2 = createMockFileEntry('img2.png');
            const img3 = createMockFileEntry('img3.png');
            
            let callCount = 0;
            const paginatedDir = {
                isFile: false,
                isDirectory: true,
                name: 'paginated',
                createReader: () => {
                    return {
                        readEntries: (callback: (entries: FileSystemEntry[]) => void) => {
                            callCount++;
                            if (callCount === 1) {
                                callback([img1, img2]);
                            } else if (callCount === 2) {
                                callback([img3]);
                            } else {
                                callback([]);
                            }
                        }
                    };
                }
            } as unknown as FileSystemDirectoryEntry;

            const result = await getAllFiles(paginatedDir);
            expect(result).toEqual(['img1.png', 'img2.png', 'img3.png']);
            expect(callCount).toBe(3);
        });
    });
});
