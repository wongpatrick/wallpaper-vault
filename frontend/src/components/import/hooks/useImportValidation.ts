/**
 * @file Import validation and scanning custom hook.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import { 
    useValidateImportPathsApiImagesImportValidatePost, 
    useValidateImportUploadedFilesApiImagesImportValidateFilesPost,
    useImportImagesApiImagesImportPost,
    useScanImportPathsApiImagesImportScanPathsPost
} from '../../../api/generated/images/images';
import type { BodyValidateImportUploadedFilesApiImagesImportValidateFilesPost, ImageValidationItem } from '../../../api/model';

const VALIDATION_CHUNK_SIZE = 5;
const PROGRESS_FINAL_DELAY_MS = 200;

export interface QueueItem extends ImageValidationItem {
    id: string;
    selected: boolean;
    filenameOverride: string;
    customTags: string[];
    customRating: string | null;
    objectUrl: string | null;
    isFolder: boolean;
}

export interface GroupMetadata {
    creatorNames: string[];
    setIdOrTitle: string;
    searchQuery: string;
}

interface UseImportValidationProps {
    opened: boolean;
    onClose?: () => void;
    initialLocalPaths: string[];
    initialFiles: File[];
    isElectron: boolean;
    suggestedFolder?: string;
    preselectedSetId?: string;
}

export function useImportValidation({
    opened,
    initialLocalPaths,
    initialFiles,
    isElectron,
    suggestedFolder,
    preselectedSetId
}: UseImportValidationProps) {
    const validatePathsMutation = useValidateImportPathsApiImagesImportValidatePost();
    const validateFilesMutation = useValidateImportUploadedFilesApiImagesImportValidateFilesPost();
    const importImagesMutation = useImportImagesApiImagesImportPost();
    const scanPathsMutation = useScanImportPathsApiImagesImportScanPathsPost();

    const [globalTags, setGlobalTags] = useState<string[]>([]);
    const [globalRating, setGlobalRating] = useState<string>('questionable');
    const [deleteSource, setDeleteSource] = useState(false);
    const [groupsMetadata, setGroupsMetadata] = useState<Record<string, GroupMetadata>>({});

    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [isValidating, setIsValidating] = useState(false);
    const [validationProgress, setValidationProgress] = useState(0);
    const [validationCount, setValidationCount] = useState(0);
    const [validationTotal, setValidationTotal] = useState(0);

    const updateGroupMetadata = <K extends keyof GroupMetadata>(
        groupKey: string,
        field: K,
        value: GroupMetadata[K]
    ) => {
        setGroupsMetadata(prev => {
            const current = prev[groupKey] || { creatorNames: [], setIdOrTitle: '', searchQuery: '' };
            return {
                ...prev,
                [groupKey]: {
                    ...current,
                    [field]: value
                }
            };
        });
    };

    useEffect(() => {
        return () => {
            queue.forEach(item => {
                if (item.objectUrl) {
                    URL.revokeObjectURL(item.objectUrl);
                }
            });
        };
    }, [queue]);

    useEffect(() => {
        if (!opened) return;

        const runValidation = async () => {
            setIsValidating(true);
            setValidationProgress(0);
            setValidationCount(0);
            setValidationTotal(0);
            setGlobalTags([]);
            setGlobalRating('questionable');
            setDeleteSource(false);

            try {
                let validatedItems: ImageValidationItem[] = [];

                if (isElectron) {
                    const allPaths = await scanPathsMutation.mutateAsync({
                        data: { local_paths: initialLocalPaths }
                    });
                    
                    const total = allPaths.length;
                    setValidationTotal(total);

                    if (total > 0) {
                        let completedCount = 0;
                        for (let i = 0; i < total; i += VALIDATION_CHUNK_SIZE) {
                            const chunk = allPaths.slice(i, i + VALIDATION_CHUNK_SIZE);
                            const resp = await validatePathsMutation.mutateAsync({
                                data: { local_paths: chunk }
                            });
                            validatedItems = [...validatedItems, ...(resp.items || [])];
                            completedCount += chunk.length;
                            setValidationCount(completedCount);
                            setValidationProgress((completedCount / total) * 100);
                        }
                    }
                } else {
                    const total = initialFiles.length;
                    setValidationTotal(total);

                    if (total > 0) {
                        let completedCount = 0;
                        for (let i = 0; i < total; i += VALIDATION_CHUNK_SIZE) {
                            const chunk = initialFiles.slice(i, i + VALIDATION_CHUNK_SIZE);
                            const uploadPayload: BodyValidateImportUploadedFilesApiImagesImportValidateFilesPost = {
                                files: chunk as unknown as string[]
                            };
                            const resp = await validateFilesMutation.mutateAsync({
                                data: uploadPayload
                            });
                            validatedItems = [...validatedItems, ...(resp.items || [])];
                            completedCount += chunk.length;
                            setValidationCount(completedCount);
                            setValidationProgress((completedCount / total) * 100);
                        }
                    }
                }

                const initialQueue = validatedItems.map((v, idx) => {
                    let objectUrl: string | null = null;
                    let isFolder = false;

                    if (!isElectron && initialFiles[idx]) {
                        objectUrl = URL.createObjectURL(initialFiles[idx]);
                    } else if (isElectron) {
                        const suffix = v.local_path.split('.').pop()?.toLowerCase();
                        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
                        isFolder = !suffix || !imageExts.includes(suffix);
                    }

                    return {
                        ...v,
                        id: `item-${idx}-${Date.now()}`,
                        selected: v.is_valid,
                        filenameOverride: v.filename,
                        customTags: [],
                        customRating: null,
                        objectUrl,
                        isFolder
                    };
                });

                setQueue(initialQueue);

                // Initialize groupsMetadata
                const initialMetadata: Record<string, GroupMetadata> = {};
                if (isElectron) {
                    for (const topPath of initialLocalPaths) {
                        const suffix = topPath.split('.').pop()?.toLowerCase();
                        const isFolder = !suffix || !['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(suffix);
                        
                        const parts = topPath.split(/[/\\]/);
                        const folderName = parts[parts.length - 1] || '';

                        if (isFolder) {
                            const nameParts = folderName.split(' - ');
                            if (nameParts.length > 1) {
                                const artistPart = nameParts[0].trim();
                                const titlePart = nameParts.slice(1).join(' - ').trim();
                                const artistNames = artistPart.split('&').map(a => a.trim()).filter(Boolean);
                                initialMetadata[topPath] = {
                                    creatorNames: artistNames,
                                    setIdOrTitle: preselectedSetId || `new:${titlePart}`,
                                    searchQuery: preselectedSetId ? '' : titlePart
                                };
                            } else {
                                initialMetadata[topPath] = {
                                    creatorNames: [],
                                    setIdOrTitle: preselectedSetId || `new:${folderName}`,
                                    searchQuery: preselectedSetId ? '' : folderName
                                };
                            }
                        } else {
                            if (!initialMetadata['individual']) {
                                initialMetadata['individual'] = {
                                    creatorNames: [],
                                    setIdOrTitle: preselectedSetId || '',
                                    searchQuery: ''
                                };
                            }
                        }
                    }
                } else {
                    initialMetadata['upload'] = {
                        creatorNames: [],
                        setIdOrTitle: preselectedSetId || (suggestedFolder ? `new:${suggestedFolder}` : ''),
                        searchQuery: preselectedSetId ? '' : (suggestedFolder || '')
                    };
                }
                setGroupsMetadata(initialMetadata);

                setValidationProgress(100);
                setTimeout(() => setIsValidating(false), PROGRESS_FINAL_DELAY_MS);
            } catch (err) {
                console.error('[Import Modal] Validation failed:', err);
                notifications.show({
                    title: 'Validation Error',
                    message: 'Failed to inspect files for import.',
                    color: 'red'
                });
                setIsValidating(false);
            }
        };

        runValidation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened]);

    const getFolderGroupKey = useCallback((itemPath: string): string => {
        if (!isElectron) return 'upload';
        for (const topPath of initialLocalPaths) {
            const suffix = topPath.split('.').pop()?.toLowerCase();
            const isFolder = !suffix || !['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(suffix);
            if (isFolder) {
                if (itemPath === topPath || itemPath.startsWith(topPath + '/') || itemPath.startsWith(topPath + '\\')) {
                    return topPath;
                }
            }
        }
        return 'individual';
    }, [isElectron, initialLocalPaths]);

    const getFolderGroupName = (groupKey: string): string => {
        if (groupKey === 'upload') return 'Uploaded Files';
        if (groupKey === 'individual') return 'Individual Files';
        const parts = groupKey.split(/[/\\]/);
        return parts[parts.length - 1] || groupKey;
    };

    const groupedQueue = useMemo(() => {
        const groups: Record<string, QueueItem[]> = {};
        queue.forEach(item => {
            const key = getFolderGroupKey(item.local_path);
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return groups;
    }, [queue, getFolderGroupKey]);

    const toggleItemSelect = (id: string) => {
        setQueue(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
    };

    const toggleGroupSelect = (groupKey: string, checked: boolean) => {
        const groupItems = groupedQueue[groupKey] || [];
        const groupIds = new Set(groupItems.map(i => i.id));
        setQueue(prev => prev.map(item => groupIds.has(item.id) ? { ...item, selected: checked } : item));
    };

    const updateItemFilename = (id: string, name: string) => {
        setQueue(prev => prev.map(item => item.id === id ? { ...item, filenameOverride: name } : item));
    };

    const removeItem = (id: string) => {
        setQueue(prev => {
            const item = prev.find(i => i.id === id);
            if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
            return prev.filter(i => i.id !== id);
        });
    };

    const selectedQueueItems = useMemo(() => queue.filter(i => i.selected), [queue]);

    return {
        globalTags,
        setGlobalTags,
        globalRating,
        setGlobalRating,
        deleteSource,
        setDeleteSource,
        groupsMetadata,
        updateGroupMetadata,
        queue,
        setQueue,
        isValidating,
        validationProgress,
        validationCount,
        validationTotal,
        groupedQueue,
        getFolderGroupKey,
        getFolderGroupName,
        toggleItemSelect,
        toggleGroupSelect,
        updateItemFilename,
        removeItem,
        selectedQueueItems,
        importImagesMutation
    };
}
