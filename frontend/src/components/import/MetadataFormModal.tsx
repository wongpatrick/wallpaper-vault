/**
 * @file
 * Module: Metadata Form Modal for Drag-and-Drop Imports
 * Description: Displays a form allowing users to assign global creators, sets, tags, and ratings
 * to dropped files/folders, showing a preview list with phash duplicate warnings and overrides.
 */
import { useMemo, useState, useEffect, Fragment } from 'react';
import { 
    Modal, TextInput, Stack, Button, Group, Text, Checkbox, 
    Table, Badge, ScrollArea, ActionIcon, Tooltip, Select, 
    TagsInput, Alert, Card, Progress
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconTrash, IconFolder, IconPhoto } from '@tabler/icons-react';
import { useAppNotifications } from '../../hooks/useAppNotifications';
import { TagAutocompleteInput } from '../ui/TagAutocompleteInput';
import { useTaskActions } from '../../hooks/useTaskActions';
import { useReadCreatorsApiCreatorsGet } from '../../api/generated/creators/creators';
import { useReadSetsApiSetsGet } from '../../api/generated/sets/sets';
import { useReadSettingsApiSettingsGet } from '../../api/generated/settings/settings';
import { useListLibraryPathsApiLibraryPathsGet } from '../../api/generated/library-paths/library-paths';
import { useImportImagesApiImagesImportPost } from '../../api/generated/images/images';
import { useImportQueue } from './hooks/useImportQueue';
import { useImportScanner } from './hooks/useImportScanner';
import { useImportFolderGroups } from './hooks/useImportFolderGroups';

const OPACITY_DESELECTED = 0.6;

interface ImportModalProps {
    opened: boolean;
    onClose: () => void;
    initialLocalPaths: string[];
    initialFiles: File[];
    isElectron: boolean;
    suggestedFolder: string;
    preselectedSetId?: string;
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
    const { showNotification } = useAppNotifications();
    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 });
    const { data: setsData } = useReadSetsApiSetsGet({ limit: 1000 });
    const { data: settingsData } = useReadSettingsApiSettingsGet();
    const { data: libraryPathsData } = useListLibraryPathsApiLibraryPathsGet();

    const [selectedLibraryPathId, setSelectedLibraryPathId] = useState<string | null>(null);
    const [globalTags, setGlobalTags] = useState<string[]>([]);
    const [globalRating, setGlobalRating] = useState<string>('questionable');
    const [deleteSource, setDeleteSource] = useState(false);
    const importImagesMutation = useImportImagesApiImagesImportPost();

    const libraryPaths = useMemo(() => libraryPathsData?.items || [], [libraryPathsData]);

    useEffect(() => {
        if (opened) {
            const defaultLp = libraryPaths.find(p => p.is_default) || libraryPaths[0];
            if (defaultLp) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setSelectedLibraryPathId(defaultLp.id.toString());
            }
            setGlobalTags([]);
            setGlobalRating('questionable');
            setDeleteSource(false);
        }
    }, [opened, libraryPaths]);

    const {
        queue,
        setQueue,
        selectedQueueItems,
        toggleItemSelect,
        updateItemFilename,
        removeItem
    } = useImportQueue({ opened });

    const {
        isValidating,
        validationProgress,
        validationCount,
        validationTotal
    } = useImportScanner({
        opened,
        initialLocalPaths,
        initialFiles,
        isElectron,
        onValidated: setQueue
    });

    const {
        groupsMetadata,
        updateGroupMetadata,
        groupedQueue,
        getFolderGroupKey,
        getFolderGroupName
    } = useImportFolderGroups({
        opened,
        queue,
        initialLocalPaths,
        isElectron,
        suggestedFolder,
        preselectedSetId
    });

    const { addTask } = useTaskActions();

    const isSourceInVault = useMemo(() => {
        if (!isElectron || initialLocalPaths.length === 0) return false;
        const paths: string[] = [];
        if (libraryPaths.length > 0) {
            libraryPaths.forEach(p => {
                if (p.path) paths.push(p.path);
            });
        } else if (settingsData) {
            const vaultSetting = settingsData.find(s => s.key === 'base_library_path');
            if (vaultSetting?.value) paths.push(vaultSetting.value);
        }
        if (paths.length === 0) return false;

        const normalizedVaultPaths = paths.map(p => p.replace(/\\/g, '/').toLowerCase());
        return initialLocalPaths.some(p => {
            const normP = p.replace(/\\/g, '/').toLowerCase();
            return normalizedVaultPaths.some(vp => normP.startsWith(vp));
        });
    }, [isElectron, libraryPaths, settingsData, initialLocalPaths]);

    const preselectedSetName = useMemo(() => {
        if (!preselectedSetId || !setsData?.items) return null;
        const set = setsData.items.find(s => s.id.toString() === preselectedSetId);
        return set ? set.title : null;
    }, [preselectedSetId, setsData]);

    const creatorOptions = useMemo(() => {
        const uniqueNames = new Set(creatorsData?.items?.map(c => c.canonical_name) || []);
        return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b));
    }, [creatorsData]);

    const getSetOptionsForGroup = (groupSearchQuery: string) => {
        const items = setsData?.items?.map(s => ({ value: s.id.toString(), label: s.title || '' })) || [];
        if (groupSearchQuery && !items.some(item => item.label.toLowerCase() === groupSearchQuery.toLowerCase())) {
            items.push({ value: `new:${groupSearchQuery}`, label: `+ Create new set: "${groupSearchQuery}"` });
        }
        return items;
    };

    const handleImport = async () => {
        const selectedItems = selectedQueueItems;
        if (selectedItems.length === 0) {
            showNotification({
                title: 'No Files Selected',
                message: 'Please select at least one file to import.',
                color: 'red'
            });
            return;
        }

        const itemsByGroup: Record<string, typeof selectedItems> = {};
        selectedItems.forEach(item => {
            const key = getFolderGroupKey(item.local_path);
            if (!itemsByGroup[key]) {
                itemsByGroup[key] = [];
            }
            itemsByGroup[key].push(item);
        });

        try {
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
                        library_path_id: selectedLibraryPathId ? Number(selectedLibraryPathId) : undefined,
                        tags: globalTags.length > 0 ? globalTags : undefined,
                        rating: globalRating,
                        delete_source: isSourceInVault ? false : deleteSource
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

                showNotification({
                    title: `Import Started: ${getFolderGroupName(groupKey)}`,
                    message: `Importing ${groupItems.length} items. Task ID: ${responseTaskId}`,
                    color: 'blue'
                });
            }

            onClose();
        } catch (error) {
            console.error('Import error:', error);
            showNotification({
                title: 'Import Failed',
                message: 'An error occurred while starting the import task.',
                color: 'red'
            });
        }
    };

    const duplicateCount = useMemo(() => queue.filter(item => item.selected && item.is_duplicate).length, [queue]);

    const totalItemsCount = useMemo(() => {
        if (isValidating) {
            return validationTotal > 0 ? validationTotal : (isElectron ? initialLocalPaths.length : initialFiles.length);
        }
        return queue.length;
    }, [isValidating, validationTotal, queue.length, isElectron, initialLocalPaths.length, initialFiles.length]);

    const activeGroupKeys = useMemo(() => {
        const keysFromQueue = Object.keys(groupedQueue);
        const keysFromMetadata = Object.keys(groupsMetadata);
        return Array.from(new Set([...keysFromQueue, ...keysFromMetadata]));
    }, [groupedQueue, groupsMetadata]);

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

                                {libraryPaths.length > 1 && (
                                    <Select
                                        label="Target Storage Location"
                                        description="Designate which library storage path new sets will be imported into."
                                        data={libraryPaths.map(p => ({
                                            value: p.id.toString(),
                                            label: `${p.label || 'Default Library'} (${p.path})`
                                        }))}
                                        value={selectedLibraryPathId}
                                        onChange={setSelectedLibraryPathId}
                                        allowDeselect={false}
                                    />
                                )}
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

                        <Stack gap="xs">
                            <Text fw={600} size="sm">Set Configurations</Text>
                            {activeGroupKeys.map((groupKey) => {
                                const meta = groupsMetadata[groupKey] || { creatorNames: [], setIdOrTitle: '', searchQuery: '' };
                                return (
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
                                );
                            })}
                        </Stack>

                        {preselectedSetId && preselectedSetName && (
                            <Alert icon={<IconAlertTriangle size={16} />} title="Importing into Existing Set" color="yellow">
                                You are dragging and dropping items directly into the existing set <strong>"{preselectedSetName}"</strong>. All dropped images will be added directly to this set rather than creating a new set.
                            </Alert>
                        )}

                        {duplicateCount > 0 && (
                            <Alert icon={<IconAlertTriangle size={16} />} title="Duplicates Detected" color="yellow">
                                {duplicateCount} image(s) match existing visual profiles in the database.
                                You can choose to skip them in the queue below or import them anyway.
                            </Alert>
                        )}

                        <Text fw={600} size="sm" mt="xs">Import Queue</Text>
                        <ScrollArea.Autosize mah={350} type="auto">
                            <Table verticalSpacing="sm" highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th style={{ width: 40 }}>
                                            <Checkbox
                                                checked={queue.some(i => i.is_valid) && queue.filter(i => i.is_valid).every(i => i.selected)}
                                                indeterminate={queue.some(i => i.selected) && !queue.filter(i => i.is_valid).every(i => i.selected)}
                                                onChange={(evt) => {
                                                    const val = evt.currentTarget.checked;
                                                    setQueue(prev => prev.map(item => ({
                                                        ...item,
                                                        selected: item.is_valid ? val : false
                                                    })));
                                                }}
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
                                                            onChange={() => toggleItemSelect(item.id)}
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
                                                                onChange={(e) => updateItemFilename(item.id, e.currentTarget.value)}
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
                                                            onClick={() => removeItem(item.id)}
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

                        <Group justify="flex-end" mt="md">
                            <Button variant="subtle" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={selectedQueueItems.length === 0}
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
