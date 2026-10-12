/**
 * @file
 * Unit tests for fileDrop.ts.
 * Verifies drag-and-drop recursive file resolution.
 */
import { describe, it, expect } from 'vitest';
import { getAllFiles } from './fileDrop';

describe('fileDrop', () => {
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
