/**
 * @file
 * Main application layout component.
 * Provides the application shell, including the header, sidebar, and notification center.
 */
import { Outlet } from "react-router-dom"
import { AppShell, Title, Box, Button, Group, ActionIcon, Tooltip, Popover, Indicator, Stack, Text, Divider, ScrollArea, ThemeIcon, Burger } from "@mantine/core"
import SideNav from "./SideNav"
import classes from './Layout.module.css';
import { useSidebarResizer } from "../../hooks/useSidebarResizer";
import { IconPackage, IconBell, IconCheck, IconX, IconCloudUpload } from "@tabler/icons-react";
import { useNotificationHistory } from "../../hooks/useNotificationHistory";
import { useState, useMemo, useRef, useEffect } from "react";
import { useDisclosure } from "@mantine/hooks";
import { useTasks } from "../../hooks/useTasks";
import { ActionLoadingOverlay } from "../ui/ActionLoadingOverlay";
import { MetadataFormModal } from "../import/MetadataFormModal";
const AUTO_TAG_OVERLAY_HEIGHT_PX = 110;


export default function MainLayout() {
    const { width, isResizing, startResizing, isCollapsed } = useSidebarResizer();
    const { history, unreadCount, markAllAsRead, clearHistory } = useNotificationHistory();
    const [opened, setOpened] = useState(false);
    const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
    const { tasks } = useTasks();

    // Drag and Drop Import state & handlers
    const [importOpened, setImportOpened] = useState(false);
    const [importLocalPaths, setImportLocalPaths] = useState<string[]>([]);
    const [importFiles, setImportFiles] = useState<File[]>([]);
    const [importIsElectron, setImportIsElectron] = useState(true);
    const [importSuggestedFolder, setImportSuggestedFolder] = useState('');

    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    useEffect(() => {
        const handleWindowDragEnter = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter.current++;
            console.log('Dragenter fired. Counter:', dragCounter.current, 'Items:', e.dataTransfer?.items?.length);
            if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                console.log('Setting isDragging to true');
                setIsDragging(true);
            }
        };

        const handleWindowDragLeave = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter.current--;
            console.log('Dragleave fired. Counter:', dragCounter.current);
            if (dragCounter.current <= 0) {
                dragCounter.current = 0;
                console.log('Setting isDragging to false');
                setIsDragging(false);
            }
        };

        const handleWindowDragOver = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const handleWindowDrop = async (e: DragEvent) => {
            console.log('Drop event fired!');
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            dragCounter.current = 0;

            if (!e.dataTransfer) {
                console.log('No dataTransfer object found.');
                return;
            }

            const items = Array.from(e.dataTransfer.items);
            const filesList = Array.from(e.dataTransfer.files);
            
            console.log('Drop filesList count:', filesList.length, 'items count:', items.length);

            const paths: string[] = [];
            const validWebFiles: File[] = [];
            let folderName = '';

            const isElectronClient = typeof window !== 'undefined' && 'electron' in window;
            console.log('isElectronClient:', isElectronClient);

            // Recursive function to read files from directory entry with relative paths
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const readDirectory = async (dirEntry: any, relativePath: string = ''): Promise<{ file: File; relativePath: string }[]> => {
                return new Promise((resolve) => {
                    const reader = dirEntry.createReader();
                    const results: { file: File; relativePath: string }[] = [];
                    const readEntries = () => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        reader.readEntries(async (entries: any[]) => {
                            if (entries.length === 0) {
                                resolve(results);
                            } else {
                                for (const entry of entries) {
                                    const currentRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
                                    if (entry.isFile) {
                                        const file = await new Promise<File>((res) => entry.file(res));
                                        results.push({ file, relativePath: currentRelativePath });
                                    } else if (entry.isDirectory) {
                                        const subFiles = await readDirectory(entry, currentRelativePath);
                                        results.push(...subFiles);
                                    }
                                }
                                readEntries();
                            }
                        }, (err: unknown) => {
                            console.error('Error reading directory entries:', err);
                            resolve([]);
                        });
                    };
                    readEntries();
                });
            };

            // Helper to get all immediate child entries of a directory
            const getImmediateEntries = async (dirEntry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
                return new Promise((resolve) => {
                    const reader = dirEntry.createReader();
                    const results: FileSystemEntry[] = [];
                    const readEntries = () => {
                        reader.readEntries((entries: FileSystemEntry[]) => {
                            if (entries.length === 0) {
                                resolve(results);
                            } else {
                                results.push(...entries);
                                readEntries();
                            }
                        }, (err: unknown) => {
                            console.error('Error reading directory entries:', err);
                            resolve([]);
                        });
                    };
                    readEntries();
                });
            };

            for (let i = 0; i < filesList.length; i++) {
                const file = filesList[i];
                const item = items[i];
                const entry = item ? item.webkitGetAsEntry() : null;
                
                // Retrieve native path in Electron using the secure webUtils.getPathForFile API exposed in the preload script
                const absolutePath = isElectronClient && window.electron?.getPathForFile 
                    ? window.electron.getPathForFile(file) 
                    : '';
                
                console.log(`Item ${i}: name=${file.name}, path=${absolutePath}, isDirectory=${entry?.isDirectory}`);
                
                if (entry) {
                    if (entry.isDirectory) {
                        if (!folderName) {
                            folderName = entry.name;
                        }
                        if (isElectronClient) {
                            if (absolutePath) {
                                console.log('Checking if folder is a parent folder in Electron:', entry.name);
                                const immediateEntries = await getImmediateEntries(entry as FileSystemDirectoryEntry);
                                const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
                                const hasRootImages = immediateEntries.some(e => {
                                    if (e.isFile) {
                                        const ext = e.name.split('.').pop()?.toLowerCase();
                                        return ext && imageExts.includes(ext);
                                    }
                                    return false;
                                });
                                const subDirs = immediateEntries.filter(e => e.isDirectory);

                                if (!hasRootImages && subDirs.length > 0) {
                                    console.log(`Detected parent folder. Expanding into ${subDirs.length} subfolders.`);
                                    const isWindows = absolutePath.includes('\\');
                                    const separator = isWindows ? '\\' : '/';
                                    subDirs.forEach((subDir) => {
                                        const subDirPath = absolutePath + separator + subDir.name;
                                        paths.push(subDirPath);
                                    });
                                } else {
                                    console.log('Resolved folder path in Electron:', absolutePath);
                                    paths.push(absolutePath);
                                }
                            } else {
                                console.warn('Failed to resolve folder path via getPathForFile');
                            }
                        } else {
                            // Recursively read directory files for standard web browser fallback
                            console.log('Recursively reading folder in web client:', entry.name);
                            const dirItems = await readDirectory(entry);
                            validWebFiles.push(...dirItems.map(di => di.file));
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

            console.log('Resolved paths:', paths, 'validWebFiles count:', validWebFiles.length);

            if (isElectronClient && paths.length > 0) {
                console.log('Opening Electron import modal with paths:', paths);
                setImportLocalPaths(paths);
                setImportFiles([]);
                setImportIsElectron(true);
                setImportSuggestedFolder(folderName);
                setImportOpened(true);
            } else if (validWebFiles.length > 0) {
                console.log('Opening Web import modal with files:', validWebFiles.length);
                setImportLocalPaths([]);
                setImportFiles(validWebFiles);
                setImportIsElectron(false);
                setImportSuggestedFolder(folderName);
                setImportOpened(true);
            } else {
                console.log('No files or paths resolved to import.');
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
    }, []);


    const activeAutoTagTask = useMemo(() => {
        return Object.values(tasks).find(
            (t) => t.id.startsWith('autotag-') && (t.status === 'accepted' || t.status === 'processing')
        );
    }, [tasks]);

    const activeImportTask = useMemo(() => {
        return Object.values(tasks).find(
            (t) => t.id.startsWith('import-') && (t.status === 'accepted' || t.status === 'processing')
        );
    }, [tasks]);


    return (
        <div style={{ minHeight: '100vh', position: 'relative' }}>
            <AppShell
                layout="alt"
            header={{ height: 56 }}
            navbar={{
                width: { base: width },
                breakpoint: 'sm',
                collapsed: { mobile: !mobileOpened },
            }}
            padding="md"
        >
            <AppShell.Header px="md" className={classes.header}>
                <Group h="100%" justify="space-between">
                    <Group style={{ flex: 1, maxWidth: 500 }}>
                        <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
                    </Group>

                    <Group gap="sm">
                        <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md" width={320}>
                            <Popover.Target>
                                <Tooltip label="Notifications">
                                    <Indicator disabled={unreadCount === 0} label={unreadCount} size={16} offset={2} color="red">
                                        <ActionIcon 
                                            variant="subtle" 
                                            color="gray" 
                                            size="md" 
                                            radius="md"
                                            onClick={() => {
                                                setOpened((o) => !o);
                                                if (!opened) markAllAsRead();
                                            }}
                                        >
                                            <IconBell size={18} stroke={1.5} />
                                        </ActionIcon>
                                    </Indicator>
                                </Tooltip>
                            </Popover.Target>
                            <Popover.Dropdown p={0}>
                                <Stack gap={0}>
                                    <Group justify="space-between" p="xs">
                                        <Text size="sm" fw={600}>Notifications</Text>
                                        <Button variant="subtle" size="compact-xs" color="gray" onClick={clearHistory}>
                                            Clear all
                                        </Button>
                                    </Group>
                                    <Divider />
                                    <ScrollArea.Autosize mah={400} type="hover">
                                        {history.length === 0 ? (
                                            <Box py="xl">
                                                <Text size="xs" c="dimmed" ta="center">No recent notifications</Text>
                                            </Box>
                                        ) : (
                                            history.map((item) => (
                                                <Box key={item.id} p="xs" className={classes.notificationItem}>
                                                    <Group align="flex-start" wrap="nowrap" gap="sm">
                                                        <ThemeIcon 
                                                            size="sm" 
                                                            radius="xl" 
                                                            color={item.color || 'blue'} 
                                                            variant="light"
                                                        >
                                                            {item.status === 'completed' || item.status === 'success' ? <IconCheck size={12} /> : 
                                                            item.status === 'error' ? <IconX size={12} /> : 
                                                            <IconBell size={12} />}
                                                        </ThemeIcon>
                                                        <Stack gap={2} style={{ flex: 1 }}>
                                                            <Text size="xs" fw={600} lineClamp={1}>{item.title}</Text>
                                                            <Text size="xs" c="dimmed" lineClamp={2}>{item.message}</Text>
                                                            <Text size="xs" c="dimmed" mt={4}>
                                                                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </Text>
                                                        </Stack>
                                                    </Group>
                                                </Box>
                                            ))
                                        )}
                                    </ScrollArea.Autosize>
                                </Stack>
                            </Popover.Dropdown>
                        </Popover>


                    </Group>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="md" className={`${classes.navbar} ${isResizing ? classes.navbarResizing : ''}`}>
                <Box 
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: isCollapsed ? 0 : '12px',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        marginBottom: 'var(--mantine-spacing-xl)',
                        height: 44,
                        transition: 'all 0.2s ease'
                    }}
                >
                    <IconPackage size={28} style={{ minWidth: 28 }} color="var(--mantine-color-blue-6)" />
                    <Title 
                        order={3} 
                        className={`${classes.appTitle} ${isCollapsed ? classes.appTitleCollapsed : ''}`} 
                    >
                        Wallpaper Vault
                    </Title>
                </Box>

                <SideNav collapsed={isCollapsed} />

                <div 
                    className={`${classes.resizer} ${isResizing ? classes.resizing : ''}`}
                    onMouseDown={startResizing}
                />
            </AppShell.Navbar>

            <AppShell.Main className={classes.main}>
                <Outlet />
                <ActionLoadingOverlay 
                    visible={!!activeAutoTagTask} 
                    title="Auto-tagging Set" 
                    message={
                        activeAutoTagTask?.status === 'processing' 
                            ? 'Auto-tagging set...' 
                            : 'Starting auto-tagging...'
                    } 
                    progress={activeAutoTagTask?.progress}
                    total={activeAutoTagTask?.total}
                />
                <ActionLoadingOverlay 
                    visible={!!activeImportTask} 
                    title="Importing Images" 
                    message={
                        activeImportTask?.status === 'processing' 
                            ? 'Importing and processing files...' 
                            : 'Starting file import...'
                    } 
                    progress={activeImportTask?.progress}
                    total={activeImportTask?.total}
                    bottomOffset={activeAutoTagTask ? AUTO_TAG_OVERLAY_HEIGHT_PX : 0}
                />
            </AppShell.Main>
        </AppShell>

        {isDragging && (
            <div className={`${classes.dragOverlay} ${classes.dragOverlayActive}`}>
                <div className={classes.dragOverlayContent}>
                    <IconCloudUpload size={80} stroke={1.5} color="var(--mantine-color-blue-5)" />
                    <Title order={2}>Drop images or folders here</Title>
                    <Text size="sm" c="dimmed">
                        Import them directly into the wallpaper vault
                    </Text>
                </div>
            </div>
        )}

        <MetadataFormModal
            opened={importOpened}
            onClose={() => setImportOpened(false)}
            initialLocalPaths={importLocalPaths}
            initialFiles={importFiles}
            isElectron={importIsElectron}
            suggestedFolder={importSuggestedFolder}
        />
    </div>
    )
}

