/**
 * @file
 * Module: Metadata Form Modal for Drag-and-Drop Imports
 * Description: Displays a form allowing users to assign global creators, sets, tags, and ratings
 * to dropped files/folders, showing a preview list with phash duplicate warnings and overrides.
 */
import { useMemo, Fragment } from 'react';
import { 
    Modal, TextInput, Stack, Button, Group, Text, Checkbox, 
    Table, Badge, ScrollArea, ActionIcon, Tooltip, Select, 
    TagsInput, Alert, Card, Progress
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconTrash, IconFolder, IconPhoto } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { TagAutocompleteInput } from '../ui/TagAutocompleteInput';
import { useTasks } from '../../hooks/useTasks';
import { useReadCreatorsApiCreatorsGet } from '../../api/generated/creators/creators';
import { useReadSetsApiSetsGet } from '../../api/generated/sets/sets';
import { useReadSettingsApiSettingsGet } from '../../api/generated/settings/settings';
import { useImportValidation } from './hooks/useImportValidation';

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
    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 });
    const { data: setsData } = useReadSetsApiSetsGet({ limit: 1000 });
    const { data: settingsData } = useReadSettingsApiSettingsGet();

    const validation = useImportValidation({
        opened,
        onClose,
        initialLocalPaths,
        initialFiles,
        isElectron,
        suggestedFolder,
        preselectedSetId
    });

    const { addTask } = useTasks();

    const isSourceInVault = useMemo(() => {
        if (!isElectron || !settingsData || initialLocalPaths.length === 0) return false;
        const vaultSetting = settingsData.find(s => s.key === 'base_library_path');
        if (!vaultSetting?.value) return false;
        const vaultPath = vaultSetting.value.replace(/\\/g, '/').toLowerCase();
        return initialLocalPaths.some(p => p.replace(/\\/g, '/').toLowerCase().startsWith(vaultPath));
    }, [isElectron, settingsData, initialLocalPaths]);

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
        const selectedItems = validation.selectedQueueItems;
        if (selectedItems.length === 0) {
            notifications.show({
                title: 'No Files Selected',
                message: 'Please select at least one file to import.',
                color: 'red'
            });
            return;
        }

        const itemsByGroup: Record<string, typeof selectedItems> = {};
        selectedItems.forEach(item => {
            const key = validation.getFolderGroupKey(item.local_path);
            if (!itemsByGroup[key]) {
                itemsByGroup[key] = [];
            }
            itemsByGroup[key].push(item);
        });

        try {
            for (const [groupKey, groupItems] of Object.entries(itemsByGroup)) {
                const meta = validation.groupsMetadata[groupKey] || { creatorNames: [], setIdOrTitle: '', searchQuery: '' };
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

                const responseTaskId = await validation.importImagesMutation.mutateAsync({
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
                        tags: validation.globalTags.length > 0 ? validation.globalTags : undefined,
                        rating: validation.globalRating,
                        delete_source: validation.deleteSource
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
                    title: `Import Started: ${validation.getFolderGroupName(groupKey)}`,
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

    const duplicateCount = useMemo(() => validation.queue.filter(item => item.selected && item.is_duplicate).length, [validation.queue]);

    const totalItemsCount = useMemo(() => {
        if (validation.isValidating) {
            return validation.validationTotal > 0 ? validation.validationTotal : (isElectron ? initialLocalPaths.length : initialFiles.length);
        }
        return validation.queue.length;
    }, [validation.isValidating, validation.validationTotal, validation.queue.length, isElectron, initialLocalPaths.length, initialFiles.length]);

    const activeGroupKeys = useMemo(() => {
        const keysFromQueue = Object.keys(validation.groupedQueue);
        const keysFromMetadata = Object.keys(validation.groupsMetadata);
        return Array.from(new Set([...keysFromQueue, ...keysFromMetadata]));
    }, [validation.groupedQueue, validation.groupsMetadata]);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Text fw={700} size="lg">
                    📥 Drag-and-Drop Import Manager ({totalItemsCount} items{validation.isValidating ? ', scanning...' : ''})
                </Text>
            }
            size="xl"
            radius="md"
            closeOnClickOutside={false}
        >
            <Stack gap="md" style={{ position: 'relative', minHeight: 300 }}>
                {validation.isValidating && (
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
                                {validation.validationTotal > 0 
                                    ? `Validating item ${validation.validationCount} of ${validation.validationTotal}...` 
                                    : 'Initializing validation...'}
                            </Text>
                            <Progress 
                                value={validation.validationProgress} 
                                size="sm" 
                                radius="xl" 
                                animated={validation.validationProgress < 100} 
                                color="blue" 
                                style={{ width: '100%' }}
                            />
                            <Text size="xs" c="dimmed">
                                {validation.validationTotal > 0 
                                    ? `${validation.validationCount} of ${validation.validationTotal} items (${Math.round(validation.validationProgress)}%)` 
                                    : `${Math.round(validation.validationProgress)}% complete`}
                            </Text>
                        </Stack>
                    </div>
                )}

                {!validation.isValidating && (
                    <>
                        <Card withBorder radius="md" p="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
                            <Stack gap="xs">
                                <Text fw={600} size="sm">Global Import Settings</Text>
                                <Group grow gap="md">
                                    <TagAutocompleteInput
                                        label="Global Tags"
                                        placeholder="Add tags to all files..."
                                        value={validation.globalTags}
                                        onChange={validation.setGlobalTags}
                                    />
                                    <Select
                                        label="Global Content Rating"
                                        data={[
                                            { value: 'safe', label: 'Safe' },
                                            { value: 'questionable', label: 'Questionable' },
                                            { value: 'explicit', label: 'Explicit' }
                                        ]}
                                        value={validation.globalRating}
                                        onChange={(val) => validation.setGlobalRating(val || 'questionable')}
                                    />
                                </Group>
                                <Tooltip
                                    label="Source files are inside the vault and cannot be deleted."
                                    disabled={!isSourceInVault}
                                >
                                    <Checkbox
                                        label="Delete source files after successful import"
                                        checked={isSourceInVault ? false : validation.deleteSource}
                                        onChange={(e) => validation.setDeleteSource(e.currentTarget.checked)}
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
                                const meta = validation.groupsMetadata[groupKey] || { creatorNames: [], setIdOrTitle: '', searchQuery: '' };
                                return (
                                    <Card key={groupKey} withBorder radius="md" p="sm" bg="light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))">
                                        <Stack gap="xs">
                                            <Text fw={700} size="xs" c="blue" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <IconFolder size={16} /> {validation.getFolderGroupName(groupKey)}
                                            </Text>
                                            <Group grow gap="md">
                                                <TagsInput
                                                    label="Creators / Artists"
                                                    placeholder="Type & Enter to add"
                                                    data={creatorOptions}
                                                    value={meta.creatorNames}
                                                    onChange={(val) => validation.updateGroupMetadata(groupKey, 'creatorNames', val)}
                                                    clearable
                                                />
                                                <Select
                                                    label="Target Set"
                                                    placeholder="Select Set or search/create (fallback: Imports)"
                                                    data={getSetOptionsForGroup(meta.searchQuery)}
                                                    value={meta.setIdOrTitle}
                                                    onChange={(val) => validation.updateGroupMetadata(groupKey, 'setIdOrTitle', val || '')}
                                                    searchable
                                                    searchValue={meta.searchQuery}
                                                    onSearchChange={(val) => validation.updateGroupMetadata(groupKey, 'searchQuery', val)}
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
                                                checked={validation.queue.length > 0 && validation.queue.every(i => i.selected || !i.is_valid)}
                                                indeterminate={validation.queue.some(i => i.selected) && !validation.queue.every(i => i.selected)}
                                                onChange={(evt) => {
                                                    const val = evt.currentTarget.checked;
                                                    validation.setQueue(prev => prev.map(item => ({
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
                                    {Object.entries(validation.groupedQueue).map(([groupKey, items]) => (
                                        <Fragment key={groupKey}>
                                            {Object.keys(validation.groupedQueue).length > 1 && (
                                                <Table.Tr bg="light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))">
                                                    <Table.Td colSpan={5} style={{ padding: '8px 12px' }}>
                                                        <Text fw={700} size="xs" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <IconFolder size={14} /> {validation.getFolderGroupName(groupKey)} ({items.length} items)
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
                                                            onChange={() => validation.toggleItemSelect(item.id)}
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
                                                                onChange={(e) => validation.updateItemFilename(item.id, e.currentTarget.value)}
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
                                                            onClick={() => validation.removeItem(item.id)}
                                                        >
                                                            <IconTrash size={16} />
                                                        </ActionIcon>
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Fragment>
                                    ))}
                                    {validation.queue.length === 0 && (
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
                                disabled={validation.selectedQueueItems.length === 0}
                                loading={validation.importImagesMutation.isPending}
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
