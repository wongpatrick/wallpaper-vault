/**
 * @file
 * Custom hook managing window-level drag-and-drop file and directory scanning.
 * Supports native Electron paths via webUtils.getPathForFile and recursive HTML5 Web Directory traversal.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { isElectron } from '../config';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

export interface UseFileDropScannerReturn {
  isDragging: boolean;
  importModalProps: {
    opened: boolean;
    onClose: () => void;
    initialLocalPaths: string[];
    initialFiles: File[];
    isElectron: boolean;
    suggestedFolder: string;
  };
  closeImportModal: () => void;
}

/**
 * Traverses a FileSystemDirectoryEntry recursively to extract files with relative paths.
 */
async function readDirectory(
  dirEntry: FileSystemDirectoryEntry,
  relativePath: string = ''
): Promise<{ file: File; relativePath: string }[]> {
  return new Promise((resolve) => {
    const reader = dirEntry.createReader();
    const results: { file: File; relativePath: string }[] = [];

    const readEntries = () => {
      reader.readEntries(
        async (entries: FileSystemEntry[]) => {
          if (entries.length === 0) {
            resolve(results);
          } else {
            for (const entry of entries) {
              const currentRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
              if (entry.isFile) {
                const file = await new Promise<File>((res) => (entry as FileSystemFileEntry).file(res));
                results.push({ file, relativePath: currentRelativePath });
              } else if (entry.isDirectory) {
                const subFiles = await readDirectory(entry as FileSystemDirectoryEntry, currentRelativePath);
                results.push(...subFiles);
              }
            }
            readEntries();
          }
        },
        (err: unknown) => {
          console.error('Error reading directory entries:', err);
          resolve([]);
        }
      );
    };

    readEntries();
  });
}

/**
 * Retrieves immediate child entries for a given directory entry.
 */
async function getImmediateEntries(dirEntry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const reader = dirEntry.createReader();
    const results: FileSystemEntry[] = [];

    const readEntries = () => {
      reader.readEntries(
        (entries: FileSystemEntry[]) => {
          if (entries.length === 0) {
            resolve(results);
          } else {
            results.push(...entries);
            readEntries();
          }
        },
        (err: unknown) => {
          console.error('Error reading directory entries:', err);
          resolve([]);
        }
      );
    };

    readEntries();
  });
}

/**
 * Hook that listens for global drag-and-drop events and collects paths/files for import.
 */
export function useFileDropScanner(): UseFileDropScannerReturn {
  const location = useLocation();

  const [importOpened, setImportOpened] = useState(false);
  const [importLocalPaths, setImportLocalPaths] = useState<string[]>([]);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importIsElectron, setImportIsElectron] = useState(true);
  const [importSuggestedFolder, setImportSuggestedFolder] = useState('');

  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const closeImportModal = useCallback(() => {
    setImportOpened(false);
  }, []);

  useEffect(() => {
    const isToolsRoute = location.pathname.startsWith('/tools');

    const handleWindowDragEnter = (e: DragEvent) => {
      if (isToolsRoute) return;

      const types = e.dataTransfer?.types;
      const hasFiles = types && Array.from(types).includes('Files');
      if (!hasFiles) return;

      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      if (isToolsRoute) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsDragging(false);
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      if (isToolsRoute) return;
      const types = e.dataTransfer?.types;
      const hasFiles = types && Array.from(types).includes('Files');
      if (!hasFiles) return;

      e.preventDefault();
      e.stopPropagation();
    };

    const handleWindowDrop = async (e: DragEvent) => {
      if (isToolsRoute) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      if (!e.dataTransfer) {
        return;
      }

      const items = Array.from(e.dataTransfer.items);
      const filesList = Array.from(e.dataTransfer.files);

      const paths: string[] = [];
      const validWebFiles: File[] = [];
      let folderName = '';

      const isElectronClient = isElectron;

      for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        const item = items[i];
        const entry = item && typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;

        const absolutePath =
          isElectronClient && window.electron?.getPathForFile
            ? window.electron.getPathForFile(file)
            : '';

        if (entry) {
          if (entry.isDirectory) {
            if (!folderName) {
              folderName = entry.name;
            }
            if (isElectronClient) {
              if (absolutePath) {
                const immediateEntries = await getImmediateEntries(entry as FileSystemDirectoryEntry);
                const hasRootImages = immediateEntries.some((child) => {
                  if (child.isFile) {
                    const ext = child.name.split('.').pop()?.toLowerCase();
                    return ext && IMAGE_EXTENSIONS.includes(ext);
                  }
                  return false;
                });
                const subDirs = immediateEntries.filter((child) => child.isDirectory);

                if (!hasRootImages && subDirs.length > 0) {
                  const isWindows = absolutePath.includes('\\');
                  const separator = isWindows ? '\\' : '/';
                  subDirs.forEach((subDir) => {
                    paths.push(absolutePath + separator + subDir.name);
                  });
                } else {
                  paths.push(absolutePath);
                }
              } else {
                console.warn('Failed to resolve folder path via getPathForFile');
              }
            } else {
              const dirItems = await readDirectory(entry as FileSystemDirectoryEntry);
              validWebFiles.push(...dirItems.map((di) => di.file));
            }
          } else {
            if (absolutePath) {
              paths.push(absolutePath);
            }
            validWebFiles.push(file);
          }
        } else {
          if (absolutePath) {
            paths.push(absolutePath);
          }
          validWebFiles.push(file);
        }
      }

      if (isElectronClient && paths.length > 0) {
        setImportLocalPaths(paths);
        setImportFiles([]);
        setImportIsElectron(true);
        setImportSuggestedFolder(folderName);
        setImportOpened(true);
      } else if (validWebFiles.length > 0) {
        setImportLocalPaths([]);
        setImportFiles(validWebFiles);
        setImportIsElectron(false);
        setImportSuggestedFolder(folderName);
        setImportOpened(true);
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [location.pathname]);

  return {
    isDragging,
    importModalProps: {
      opened: importOpened,
      onClose: closeImportModal,
      initialLocalPaths: importLocalPaths,
      initialFiles: importFiles,
      isElectron: importIsElectron,
      suggestedFolder: importSuggestedFolder,
    },
    closeImportModal,
  };
}
