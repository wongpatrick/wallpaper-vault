/**
 * @file
 * Drag-and-drop FileSystem API traversal utilities.
 * Recursively extracts supported image files from dropped files and directories.
 */

/**
 * Safely reads all entries from a FileSystemDirectoryReader, handling pagination limits (e.g., 100 entries max in Chromium).
 */
async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
    let allEntries: FileSystemEntry[] = [];
    while (true) {
        const entries = await new Promise<FileSystemEntry[]>((resolve) => {
            reader.readEntries(resolve, () => resolve([]));
        });
        if (entries.length === 0) break;
        allEntries = allEntries.concat(entries);
    }
    return allEntries;
}

/**
 * Recursively gets all files from a FileSystemEntry (drag and drop).
 */
export async function getAllFiles(entry: FileSystemEntry): Promise<string[]> {
    const files: string[] = [];

    async function readEntry(e: FileSystemEntry, path = '') {
        if (e.isFile) {
            const fileEntry = e as FileSystemFileEntry;
            const file = await new Promise<File | null>((resolve) => {
                fileEntry.file(resolve, () => resolve(null));
            });
            // Only include common image extensions if file was read successfully
            if (file && /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(file.name)) {
                files.push(path ? `${path}/${file.name}` : file.name);
            }
        } else if (e.isDirectory) {
            const dirEntry = e as FileSystemDirectoryEntry;
            const reader = dirEntry.createReader();
            const entries = await readAllEntries(reader);
            for (const subEntry of entries) {
                await readEntry(subEntry, path ? `${path}/${e.name}` : e.name);
            }
        }
    }

    // If it's the root directory being dropped, we don't want the root name in the path
    if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const reader = dirEntry.createReader();
        const entries = await readAllEntries(reader);
        for (const subEntry of entries) {
            await readEntry(subEntry, '');
        }
    } else {
        await readEntry(entry, '');
    }

    return files;
}
