/**
 * @file
 * Module: Metadata Form Modal for Drag-and-Drop Imports
 * Description: Displays a form allowing users to assign global creators, sets, tags, and ratings
 * to dropped files/folders, showing a preview list with phash duplicate warnings and overrides.
 */
import { useState, useEffect, useMemo, Fragment } from 'react';
import { 
    Modal, TextInput, Stack, Button, Group, Text, Checkbox, 
    Table, Badge, ScrollArea, ActionIcon, Tooltip, Select, 
    TagsInput, Alert, Card, Progress
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconTrash, IconFolder, IconPhoto } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { TagAutocompleteInput } from '../ui/TagAutocompleteInput';
import { useTasks } from '../../hooks/useTasks';
import { 
    useReadCreatorsApiCreatorsGet
} from '../../api/generated/creators/creators';
import { useReadSetsApiSetsGet } from '../../api/generated/sets/sets';
import { useReadSettingsApiSettingsGet } from '../../api/generated/settings/settings';
import { 
    useValidateImportPathsApiImagesImportValidatePost, 
    useValidateImportUploadedFilesApiImagesImportValidateFilesPost,
    useImportImagesApiImagesImportPost,
    useScanImportPathsApiImagesImportScanPathsPost
} from '../../api/generated/images/images';
import type { ImageValidationItem } from '../../api/model';

const OPACITY_DESELECTED = 0.6;
const PROGRESS_FINAL_DELAY_MS = 200;
const VALIDATION_CHUNK_SIZE = 5;

interface ImportModalProps {
    opened: boolean;
    onClose: () => void;
    initialLocalPaths: string[];
    initialFiles: File[];
    isElectron: boolean;
    suggestedFolder: string;
    preselectedSetId?: string;
}

interface QueueItem extends ImageValidationItem {
    id: string; // unique local ID
    selected: boolean;
    filenameOverride: string;
    customTags: string[];
    customRating: string | null;
    objectUrl: string | null;
    isFolder: boolean;
}

export function MetadataFormModal({
    opened,
    onClose,
    initialLocalPaths,
    initialFiles,
    isElectron,
    suggestedFolder,
    preselectedSetId
}: ImportModalProps) {
    // API Hooks
    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 });
    const { data: setsData } = useReadSetsApiSetsGet({ limit: 1000 });
    const validatePathsMutation = useValidateImportPathsApiImagesImportValidatePost();
    const validateFilesMutation = useValidateImportUploadedFilesApiImagesImportValidateFilesPost();
    const importImagesMutation = useImportImagesApiImagesImportPost();
    const scanPathsMutation = useScanImportPathsApiImagesImportScanPathsPost();
    const { data: settingsData } = useReadSettingsApiSettingsGet();

    // Determine if source paths are inside the vault to prevent self-deletion
    const isSourceInVault = useMemo(() => {
        if (!isElectron || !settingsData || initialLocalPaths.length === 0) return false;
        const vaultSetting = settingsData.find(s => s.key === 'base_library_path');
        if (!vaultSetting?.value) return false;
        const vaultPath = vaultSetting.value.replace(/\\/g, '/').toLowerCase();
        return initialLocalPaths.some(p => p.replace(/\\/g, '/').toLowerCase().startsWith(vaultPath));
    }, [isElectron, settingsData, initialLocalPaths]);

    // Resolve preselected set name for warnings
    const preselectedSetName = useMemo(() => {
        if (!preselectedSetId || !setsData?.items) return null;
        const set = setsData.items.find(s => s.id.toString() === preselectedSetId);
        return set ? set.title : null;
    }, [preselectedSetId, setsData]);

    // Form State
    const [globalTags, setGlobalTags] = useState<string[]>([]);
    const [globalRating, setGlobalRating] = useState<string>('questionable');
    const [deleteSource, setDeleteSource] = useState(false);
    
    // Group-level Metadata State
    interface GroupMetadata {
        creatorNames: string[];
        setIdOrTitle: string;
        searchQuery: string;
    }
    const [groupsMetadata, setGroupsMetadata] = useState<Record<string, GroupMetadata>>({});

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

    // Helper to resolve which folder group an item belongs to
    const getFolderGroupKey = (itemPath: string): string => {
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
    };

    const getFolderGroupName = (groupKey: string): string => {
        if (groupKey === 'upload') return 'Uploaded Files';
        if (groupKey === 'individual') return 'Individual Files';
        const parts = groupKey.split(/[/\\]/);
        return parts[parts.length - 1] || groupKey;
    };

    const getSetOptionsForGroup = (groupSearchQuery: string) => {
        const items = setsData?.items?.map(s => ({ value: s.id.toString(), label: s.title || '' })) || [];
        if (groupSearchQuery && !items.some(item => item.label.toLowerCase() === groupSearchQuery.toLowerCase())) {
            items.push({ value: `new:${groupSearchQuery}`, label: `+ Create new set: "${groupSearchQuery}"` });
        }
        return items;
    };

    // Queue State
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [isValidating, setIsValidating] = useState(false);
    const [validationProgress, setValidationProgress] = useState(0);
    const [validationCount, setValidationCount] = useState(0);
    const [validationTotal, setValidationTotal] = useState(0);

    // Memoized creators list for autocomplete/tags input
    const creatorOptions = useMemo(() => {
        const uniqueNames = new Set(creatorsData?.items?.map(c => c.canonical_name) || []);
        return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b));
    }, [creatorsData]);

    // Object URL cleanups on unmount/re-open
    useEffect(() => {
        return () => {
            queue.forEach(item => {
                if (item.objectUrl) {
                    URL.revokeObjectURL(item.objectUrl);
                }
            });
        };
    }, [queue]);

    // Initialize and run validation when the modal opens
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
                    // 1. Scan paths to get all flat files
                    const allPaths = await scanPathsMutation.mutateAsync({
                        data: { local_paths: initialLocalPaths }
                    });
                    
                    const total = allPaths.length;
                    setValidationTotal(total);

                    if (total > 0) {
                        // 2. Chunk validatePaths
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
                        // Chunk validateFiles
                        let completedCount = 0;
                        for (let i = 0; i < total; i += VALIDATION_CHUNK_SIZE) {
                            const chunk = initialFiles.slice(i, i + VALIDATION_CHUNK_SIZE);
                            const resp = await validateFilesMutation.mutateAsync({
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                data: { files: chunk } as any
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
                // Pause briefly so user can see it hit 100%
                await new Promise((res) => setTimeout(res, PROGRESS_FINAL_DELAY_MS));
            } catch (err) {
                console.error('Validation error:', err);
                notifications.show({
                    title: 'Validation Failed',
                    message: 'Could not perform pre-import duplicate validation checks.',
                    color: 'red'
                });
                onClose();
            } finally {
                setIsValidating(false);
            }
        };

        runValidation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened]);

    const { addTask } = useTasks();

    const handleImport = async () => {
        const selectedItems = queue.filter(item => item.selected);
        if (selectedItems.length === 0) {
            notifications.show({
                title: 'No Files Selected',
                message: 'Please select at least one file to import.',
                color: 'red'
            });
            return;
        }

        // Group selected items by their folder group
        const itemsByGroup: Record<string, typeof selectedItems> = {};
        selectedItems.forEach(item => {
            const key = getFolderGroupKey(item.local_path);
            if (!itemsByGroup[key]) {
                itemsByGroup[key] = [];
            }
            itemsByGroup[key].push(item);
        });

        try {
            // Trigger import call for each group sequentially
            for (const [groupKey, groupItems] of Object.entries(itemsByGroup)) {
                const meta = groupsMetadata[groupKey] || { creatorNames: [], setIdOrTitle: '', searchQuery: '' };
                const creatorStr = meta.creatorNames.join(' & ');
                let targetSetId: number | undefined;
                let targetSetTitle: string | undefined;

                if (meta.setIdOrTitle) {
                    if (meta.setIdOrTitle.startsWith('new:')) {
                        targetSetTitle = meta.setIdOrTitle.substring(4);
                    } else {
                        targetSetId = parseInt(meta.setIdOrTitle, 10);
                    }
                }

                const responseTaskId = await importImagesMutation.mutateAsync({
                    data: {
                        items: groupItems.map(item => ({
                            local_path: item.local_path,
                            filename: item.filenameOverride,
                            rating: item.customRating || undefined,
                            tags: item.customTags.length > 0 ? item.customTags : undefined
                        })),
                        creator_name: creatorStr || undefined,
                        set_title: targetSetTitle || undefined,
                        set_id: targetSetId || undefined,
                        tags: globalTags.length > 0 ? globalTags : undefined,
                        rating: globalRating,
                        delete_source: deleteSource
                    }
                });

                if (addTask && responseTaskId) {
                    addTask({
                        id: responseTaskId,
                        status: 'accepted',
                        progress: 0,
                        total: groupItems.length
                    });
                }

                notifications.show({
                    title: `Import Started: ${getFolderGroupName(groupKey)}`,
                    message: `Importing ${groupItems.length} items. Task ID: ${responseTaskId}`,
                    color: 'blue'
                });
            }

            onClose();
        } catch (error) {
            console.error('Import error:', error);
            notifications.show({
                title: 'Import Failed',
                message: 'An error occurred while starting the import task.',
                color: 'red'
            });
        }
    };

    const toggleSelectAll = (val: boolean) => {
        setQueue(prev => prev.map(item => ({
            ...item,
            selected: item.is_valid ? val : false
        })));
    };

    const updateItem = <K extends keyof QueueItem>(id: string, field: K, value: QueueItem[K]) => {
        setQueue(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    const duplicateCount = useMemo(() => queue.filter(item => item.selected && item.is_duplicate).length, [queue]);

    const totalItemsCount = useMemo(() => {
        if (isValidating) {
            return validationTotal > 0 ? validationTotal : (isElectron ? initialLocalPaths.length : initialFiles.length);
        }
        return queue.length;
    }, [isValidating, validationTotal, queue.length, isElectron, initialLocalPaths.length, initialFiles.length]);

    // Group queue items by groupKey
    const groupedQueue = useMemo(() => {
        const groups: Record<string, QueueItem[]> = {};
        queue.forEach(item => {
            const key = getFolderGroupKey(item.local_path);
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
        });
        return groups;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queue, initialLocalPaths]);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Text fw={700} size="lg">
                    📥 Drag-and-Drop Import Manager ({totalItemsCount} items{isValidating ? ', scanning...' : ''})
                </Text>
            }
            size="xl"
            radius="md"
            closeOnClickOutside={false}
        >
            <Stack gap="md" style={{ position: 'relative', minHeight: 300 }}>
                {isValidating && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 400,
                        background: 'light-dark(rgba(255, 255, 255, 0.85), rgba(26, 27, 30, 0.85))',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 'var(--mantine-radius-md)'
                    }}>
                        <Stack align="center" gap="sm" style={{ width: '80%', maxWidth: 400 }}>
                            <Text fw={600} size="sm">
                                {validationTotal > 0 
                                    ? `Validating item ${validationCount} of ${validationTotal}...` 
                                    : 'Initializing validation...'}
                            </Text>
                            <Progress 
                                value={validationProgress} 
                                size="sm" 
                                radius="xl" 
                                animated={validationProgress < 100} 
                                color="blue" 
                                style={{ width: '100%' }}
                            />
                            <Text size="xs" c="dimmed">
                                {validationTotal > 0 
                                    ? `${validationCount} of ${validationTotal} items (${Math.round(validationProgress)}%)` 
                                    : `${Math.round(validationProgress)}% complete`}
                            </Text>
                        </Stack>
                    </div>
                )}

                {!isValidating && (
                    <>
                        {/* Global Import Settings */}
                        <Card withBorder radius="md" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
                            <Stack gap="xs">
                                <Text fw={600} size="sm">Global Import Settings</Text>
                                <Group grow gap="md">
                                    <TagAutocompleteInput
                                        label="Global Tags"
                                        placeholder="Add tags to all files..."
                                        value={globalTags}
                                        onChange={setGlobalTags}
                                    />
                                    <Select
                                        label="Global Content Rating"
                                        data={[
                                            { value: 'safe', label: 'Safe' },
                                            { value: 'questionable', label: 'Questionable' },
                                            { value: 'explicit', label: 'Explicit' }
                                        ]}
                                        value={globalRating}
                                        onChange={(val) => setGlobalRating(val || 'questionable')}
                                    />
                                </Group>
                                <Tooltip
                                    label="Source files are inside the vault and cannot be deleted."
                                    disabled={!isSourceInVault}
                                >
                                    <Checkbox
                                        label="Delete source files after successful import"
                                        checked={isSourceInVault ? false : deleteSource}
                                        onChange={(e) => setDeleteSource(e.currentTarget.checked)}
                                        disabled={isSourceInVault}
                                        color="red"
                                        mt="xs"
                                    />
                                </Tooltip>
                            </Stack>
                        </Card>

                        {/* Set Configurations per Folder Group */}
                        <Stack gap="xs">
                            <Text fw={600} size="sm">Set Configurations</Text>
                            {Object.entries(groupsMetadata).map(([groupKey, meta]) => (
                                <Card key={groupKey} withBorder radius="md" p="sm" bg="light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))">
                                    <Stack gap="xs">
                                        <Text fw={700} size="xs" c="blue" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <IconFolder size={16} /> {getFolderGroupName(groupKey)}
                                        </Text>
                                        <Group grow gap="md">
                                            <TagsInput
                                                label="Creators / Artists"
                                                placeholder="Type & Enter to add"
                                                data={creatorOptions}
                                                value={meta.creatorNames}
                                                onChange={(val) => updateGroupMetadata(groupKey, 'creatorNames', val)}
                                                clearable
                                            />
                                            <Select
                                                label="Target Set"
                                                placeholder="Select Set or search/create (fallback: Imports)"
                                                data={getSetOptionsForGroup(meta.searchQuery)}
                                                value={meta.setIdOrTitle}
                                                onChange={(val) => updateGroupMetadata(groupKey, 'setIdOrTitle', val || '')}
                                                searchable
                                                searchValue={meta.searchQuery}
                                                onSearchChange={(val) => updateGroupMetadata(groupKey, 'searchQuery', val)}
                                                clearable
                                            />
                                        </Group>
                                    </Stack>
                                </Card>
                            ))}
                        </Stack>

                        {/* Preselected Set Warning Alert */}
                        {preselectedSetId && preselectedSetName && (
                            <Alert icon={<IconAlertTriangle size={16} />} title="Importing into Existing Set" color="yellow">
                                You are dragging and dropping items directly into the existing set <strong>"{preselectedSetName}"</strong>. All dropped images will be added directly to this set rather than creating a new set.
                            </Alert>
                        )}

                        {/* Duplicate Warnings Alert */}
                        {duplicateCount > 0 && (
                            <Alert icon={<IconAlertTriangle size={16} />} title="Duplicates Detected" color="yellow">
                                {duplicateCount} image(s) match existing visual profiles in the database.
                                You can choose to skip them in the queue below or import them anyway.
                            </Alert>
                        )}

                        {/* Queue Table */}
                        <Text fw={600} size="sm" mt="xs">Import Queue</Text>
                        <ScrollArea.Autosize mah={350} type="auto">
                            <Table verticalSpacing="sm" highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th style={{ width: 40 }}>
                                            <Checkbox
                                                checked={queue.length > 0 && queue.every(i => i.selected || !i.is_valid)}
                                                indeterminate={queue.some(i => i.selected) && !queue.every(i => i.selected)}
                                                onChange={(e) => toggleSelectAll(e.currentTarget.checked)}
                                            />
                                        </Table.Th>
                                        <Table.Th style={{ width: 80 }}>Preview</Table.Th>
                                        <Table.Th>Target Filename</Table.Th>
                                        <Table.Th>Status / Details</Table.Th>
                                        <Table.Th style={{ width: 60 }}></Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {Object.entries(groupedQueue).map(([groupKey, items]) => (
                                        <Fragment key={groupKey}>
                                            {Object.keys(groupedQueue).length > 1 && (
                                                <Table.Tr bg="light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))">
                                                    <Table.Td colSpan={5} style={{ padding: '8px 12px' }}>
                                                        <Text fw={700} size="xs" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <IconFolder size={14} /> {getFolderGroupName(groupKey)} ({items.length} items)
                                                        </Text>
                                                    </Table.Td>
                                                </Table.Tr>
                                            )}
                                            {items.map((item) => (
                                                <Table.Tr key={item.id} style={{ opacity: item.selected ? 1 : OPACITY_DESELECTED }}>
                                                    <Table.Td>
                                                        <Checkbox
                                                            checked={item.selected}
                                                            disabled={!item.is_valid}
                                                            onChange={(e) => updateItem(item.id, 'selected', e.currentTarget.checked)}
                                                        />
                                                    </Table.Td>
                                                    <Table.Td>
                                                        {item.isFolder ? (
                                                            <Group justify="center">
                                                                <IconFolder size={32} color="var(--mantine-color-yellow-5)" />
                                                            </Group>
                                                        ) : item.objectUrl ? (
                                                            <img
                                                                src={item.objectUrl}
                                                                alt="preview"
                                                                style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }}
                                                            />
                                                        ) : (
                                                            <Group justify="center">
                                                                <IconPhoto size={32} color="var(--mantine-color-blue-5)" />
                                                            </Group>
                                                        )}
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Stack gap={2}>
                                                            <TextInput
                                                                size="xs"
                                                                value={item.filenameOverride}
                                                                onChange={(e) => updateItem(item.id, 'filenameOverride', e.currentTarget.value)}
                                                                disabled={!item.selected}
                                                            />
                                                            <Text size="10px" c="dimmed" lineClamp={1}>
                                                                Source: {item.local_path}
                                                            </Text>
                                                        </Stack>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        {!item.is_valid ? (
                                                            <Badge color="red" variant="light">
                                                                Error: {item.error || 'Invalid file'}
                                                            </Badge>
                                                        ) : item.is_duplicate ? (
                                                            <Tooltip label={`Duplicate of image in Set: "${item.existing_set_title}" by ${item.existing_creator_names?.join(', ') || 'Unknown'}`}>
                                                                <Badge color="yellow" variant="filled" leftSection={<IconAlertTriangle size={12} />} style={{ cursor: 'pointer' }}>
                                                                    Duplicate
                                                                </Badge>
                                                            </Tooltip>
                                                        ) : (
                                                            <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}>
                                                                Ready
                                                            </Badge>
                                                        )}
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <ActionIcon
                                                            variant="subtle"
                                                            color="red"
                                                            onClick={() => setQueue(prev => prev.filter(q => q.id !== item.id))}
                                                        >
                                                            <IconTrash size={16} />
                                                        </ActionIcon>
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Fragment>
                                    ))}
                                    {queue.length === 0 && (
                                        <Table.Tr>
                                            <Table.Td colSpan={5}>
                                                <Text ta="center" c="dimmed" py="xl">
                                                    No items in import queue.
                                                </Text>
                                            </Table.Td>
                                        </Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea.Autosize>

                        {/* Footer Controls */}
                        <Group justify="flex-end" mt="md">
                            <Button variant="subtle" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={queue.filter(item => item.selected).length === 0}
                                loading={importImagesMutation.isPending}
                            >
                                Import Selected
                            </Button>
                        </Group>
                    </>
                )}
            </Stack>
        </Modal>
    );
}
