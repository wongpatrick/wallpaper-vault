/**
 * @file
 * Hook for partitioning import queue items into folder groups and managing group metadata.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { parseFolderMetadata } from '../../../utils/folderParserUtils';
import type { QueueItem } from './useImportQueue';

export interface GroupMetadata {
    creatorNames: string[];
    setIdOrTitle: string;
    searchQuery: string;
}

interface UseImportFolderGroupsProps {
    opened: boolean;
    queue: QueueItem[];
    initialLocalPaths: string[];
    isElectron: boolean;
    suggestedFolder?: string;
    preselectedSetId?: string;
}

export function useImportFolderGroups({
    opened,
    queue,
    initialLocalPaths,
    isElectron,
    suggestedFolder,
    preselectedSetId
}: UseImportFolderGroupsProps) {
    const [groupsMetadata, setGroupsMetadata] = useState<Record<string, GroupMetadata>>({});

    useEffect(() => {
        if (!opened) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setGroupsMetadata({});
            return;
        }

        const initialMetadata: Record<string, GroupMetadata> = {};
        if (isElectron) {
            for (const topPath of initialLocalPaths) {
                const suffix = topPath.split('.').pop()?.toLowerCase();
                const isFolder = !suffix || !['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(suffix);
                const parts = topPath.split(/[/\\]/);
                const folderName = parts[parts.length - 1] || '';

                if (isFolder) {
                    const parsed = parseFolderMetadata(folderName);
                    if (parsed.isParsed) {
                        initialMetadata[topPath] = {
                            creatorNames: parsed.creatorNames,
                            setIdOrTitle: preselectedSetId || `new:${parsed.setTitle}`,
                            searchQuery: preselectedSetId ? '' : parsed.setTitle
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
            let uploadCreatorNames: string[] = [];
            let uploadSetTitle = suggestedFolder || '';
            if (suggestedFolder) {
                const parts = suggestedFolder.split(/[/\\\\]/);
                const topFolder = parts[0] || suggestedFolder;
                const parsed = parseFolderMetadata(topFolder);
                if (parsed.isParsed) {
                    uploadCreatorNames = parsed.creatorNames;
                    uploadSetTitle = parsed.setTitle;
                }
            }
            initialMetadata['upload'] = {
                creatorNames: uploadCreatorNames,
                setIdOrTitle: preselectedSetId || (uploadSetTitle ? `new:${uploadSetTitle}` : ''),
                searchQuery: preselectedSetId ? '' : (uploadSetTitle || '')
            };
        }
        setGroupsMetadata(initialMetadata);
    }, [opened, isElectron, initialLocalPaths, suggestedFolder, preselectedSetId]);

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

    const getFolderGroupName = useCallback((groupKey: string): string => {
        if (groupKey === 'upload') return 'Uploaded Files';
        if (groupKey === 'individual') return 'Individual Files';
        const parts = groupKey.split(/[/\\]/);
        return parts[parts.length - 1] || groupKey;
    }, []);

    const groupedQueue = useMemo(() => {
        const groups: Record<string, QueueItem[]> = {};
        queue.forEach(item => {
            const key = getFolderGroupKey(item.local_path);
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return groups;
    }, [queue, getFolderGroupKey]);

    const updateGroupMetadata = useCallback(<K extends keyof GroupMetadata>(
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
    }, []);

    return {
        groupsMetadata,
        updateGroupMetadata,
        groupedQueue,
        getFolderGroupKey,
        getFolderGroupName
    };
}
