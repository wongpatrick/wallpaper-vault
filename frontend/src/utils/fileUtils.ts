export const isImage = (fileName: string) => {
    return /\.(jpe?g|png|webp|gif|avif)$/i.test(fileName);
};

export const getAllFiles = async (entry: FileSystemEntry): Promise<string[]> => {
    const results: string[] = [];
    
    const internal = async (e: FileSystemEntry, rel: string) => {
        if (e.isFile) {
            if (isImage(e.name)) results.push(rel ? `${rel}/${e.name}` : e.name);
        } else if (e.isDirectory) {
            const reader = (e as FileSystemDirectoryEntry).createReader();
            let entries: FileSystemEntry[];
            do {
                entries = await new Promise(r => {
                    reader.readEntries(r, (err) => {
                        console.error('Error reading directory:', err);
                        r([]);
                    });
                });
                for (const sub of entries) {
                    await internal(sub, rel ? `${rel}/${e.name}` : e.name);
                }
            } while (entries.length > 0);
        }
    };

    if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        let entries: FileSystemEntry[];
        do {
            entries = await new Promise(r => {
                reader.readEntries(r, (err) => {
                    console.error('Error reading directory:', err);
                    r([]);
                });
            });
            for (const sub of entries) {
                await internal(sub, '');
            }
        } while (entries.length > 0);
    } else {
        if (isImage(entry.name)) results.push(entry.name);
    }
    return results;
};
