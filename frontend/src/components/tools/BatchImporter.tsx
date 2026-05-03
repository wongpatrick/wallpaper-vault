import { Text, Card, TextInput, Group, Stack, Table, Badge, ActionIcon, Tooltip, Paper, Switch, Button, ThemeIcon } from '@mantine/core';
import { IconSettings, IconCheck, IconX, IconCloudUpload, IconCrop, IconSearch, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { useBatchImportSetsApiSetsBatchImportPost } from '../../api/generated/sets/sets';
import { useNotificationHistory } from '../../context/NotificationContext';
import type { BatchImportItem } from '../../api/model';

export function BatchImporter() {
    const [template, setTemplate] = useState('Coser@[Creator] - [Set]');
    const [results, setResults] = useState<BatchImportItem[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [globalDeleteSource, setGlobalDeleteSource] = useState(true);

    const { mutateAsync: batchImportApi } = useBatchImportSetsApiSetsBatchImportPost();
    const { showNotification } = useNotificationHistory();

    const handleResultChange = (index: number, field: keyof BatchImportItem, value: string | boolean) => {
// ... rest of code unchanged ...
        setResults(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value } as BatchImportItem;
            return next;
        });
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        const items = Array.from(e.dataTransfer.items);
        const paths: string[] = [];

        for (const item of items) {
            const entry = item.webkitGetAsEntry();
            if (entry && entry.isDirectory) {
                const file = item.getAsFile();
                const absolutePath = (file as { path?: string } | null)?.path || '';
                if (absolutePath) paths.push(absolutePath);
            }
        }

        if (paths.length > 0) {
            setIsScanning(true);
            try {
                const response = await batchImportApi({
                    data: {
                        items: paths.map(p => ({ source_path: p })),
                        dry_run: true,
                        parsing_template: template
                    }
                });
                
                const newItems = response.items || [];
                setResults(prev => {
                    const existingPaths = new Set(prev.map(r => r.source_path));
                    const uniqueNew = newItems.filter(r => !existingPaths.has(r.source_path));
                    return [...prev, ...uniqueNew];
                });
            } catch (err: unknown) {
                console.error('Drop error:', err);
                showNotification({ title: 'Error', message: 'Failed to parse dropped folders', color: 'red', status: 'error' });
            } finally {
                setIsScanning(false);
            }
        }
    };

    const handleScan = async () => {
        setIsScanning(true);
        try {
            const response = await batchImportApi({
                data: {
                    scan_auto_path: true,
                    dry_run: true,
                    parsing_template: template
                }
            });
            
            const newItems = response.items || [];
            if (newItems.length > 0) {
                setResults(prev => {
                    const existingPaths = new Set(prev.map(r => r.source_path));
                    const uniqueNew = newItems.filter(r => !existingPaths.has(r.source_path));
                    return [...prev, ...uniqueNew];
                });
                showNotification({ title: 'Scan Complete', message: `Found ${newItems.length} potential sets.`, color: 'green', status: 'success' });
            } else {
                showNotification({ title: 'Scan Complete', message: 'No folders found in auto-parse path.', color: 'blue', status: 'info' });
            }
        } catch (err: unknown) {
            console.error('Scan error:', err);
            showNotification({ title: 'Scan Failed', message: 'Could not access auto-parse path.', color: 'red', status: 'error' });
        } finally {
            setIsScanning(false);
        }
    };

    const handleReparse = async () => {
        if (results.length === 0) return;
        setIsScanning(true);
        try {
            const response = await batchImportApi({
                data: {
                    items: results.map(r => ({ source_path: r.source_path })),
                    dry_run: true,
                    parsing_template: template
                }
            });
            
            const updatedItems = response.items || [];
            setResults(prev => prev.map(old => {
                const match = updatedItems.find(u => u.source_path === old.source_path);
                return match ? match : old;
            }));
            showNotification({ title: 'Queue Updated', message: 'Applied new template to current queue.', color: 'blue', status: 'info' });
        } catch (err) {
            showNotification({ title: 'Error', message: 'Failed to re-parse queue', color: 'red', status: 'error' });
        } finally {
            setIsScanning(false);
        }
    };

    const handleImportAll = async () => {
        const pendingResults = results.filter(r => r.isValid && (r.status === 'pending' || r.status === 'error'));
        if (pendingResults.length === 0) return;

        setIsImporting(true);
        try {
            const response = await batchImportApi({
                data: {
                    items: pendingResults.map(r => ({
                        source_path: r.source_path,
                        creator_name: r.creator_name,
                        set_title: r.set_title,
                        delete_source: globalDeleteSource,
                        auto_orient: true
                    })),
                    dry_run: false,
                    delete_source_default: globalDeleteSource
                }
            });
            
            if (response.status === 'accepted') {
                showNotification({ 
                    title: 'Batch Import Started', 
                    message: 'The import is running in the background. You can safely navigate away.', 
                    color: 'blue',
                    status: 'info'
                });
                setResults([]); // Clear the local queue since it's now being processed in the background
            } else {
                // Map results back to local state (for sync fallback)
                const updatedItems = response.items || [];
                setResults(prev => prev.map(old => {
                    const match = updatedItems.find(u => u.source_path === old.source_path);
                    return match ? match : old;
                }));

                showNotification({ title: 'Batch Import Finished', message: 'Check the queue for status details.', color: 'green', status: 'success' });
            }
        } catch (err: unknown) {
            console.error('Import error:', err);
            showNotification({ title: 'Import Failed', message: 'An error occurred during batch processing.', color: 'red', status: 'error' });
        } finally {
            setIsImporting(false);
        }
    };


    return (
        <Card shadow="sm" padding="xl" radius="md" withBorder>
            <style>
                {`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spinning {
                    animation: spin 1s linear infinite;
                }
                `}
            </style>
            <Stack gap="lg">
                <Group justify="space-between">
                    <Group>
                        <ThemeIcon size={40} radius="md" variant="light" color="grape">
                            <IconCrop size={24} />
                        </ThemeIcon>
                        <div>
                            <Text fw={700}>Batch Auto-Importer</Text>
                            <Text size="xs" c="dimmed">AI-crop and move sets directly to vault.</Text>
                        </div>
                    </Group>
                    <Stack gap={5} align="flex-end">
                        <Switch 
                            label="Delete source after import" 
                            checked={globalDeleteSource} 
                            onChange={(event) => setGlobalDeleteSource(event.currentTarget.checked)}
                            size="xs"
                            color="red"
                        />
                    </Stack>
                </Group>

                <Paper withBorder p="md" radius="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                    <Stack gap="xs">
                        <Group gap="xs">
                            <IconSettings size={18} />
                            <Text fw={500} size="sm">Parsing Template (Backend Regex)</Text>
                        </Group>
                        <TextInput 
                            value={template}
                            onChange={(e) => setTemplate(e.currentTarget.value)}
                            placeholder="e.g. [Creator] - [Set]"
                            size="sm"
                        />
                        <Text size="xs" c="dimmed">Use [Creator] and [Set] placeholders to match folder names.</Text>
                    </Stack>
                </Paper>

                <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} style={{ cursor: 'pointer' }}>
                    <Paper 
                        withBorder p={30} radius="md" 
                        bg="light-dark(var(--mantine-color-grape-0), rgba(132, 94, 247, 0.1))"
                        style={{ 
                            borderStyle: 'dashed', 
                            borderWidth: 2, 
                            borderColor: 'var(--mantine-color-grape-4)', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            justifyContent: 'center' 
                        }}
                    >
                        <Stack align="center" gap="xs">
                            <IconCloudUpload size={40} stroke={1.5} color="var(--mantine-color-grape-6)" />
                            <div style={{ textAlign: 'center' }}>
                                <Text fw={500}>Drop set folders here</Text>
                                <Text size="xs" c="dimmed">Folders will be parsed by backend and queued</Text>
                            </div>
                            <Text size="xs" fw={700} c="grape" my={5}>— OR —</Text>
                            <Button 
                                variant="light" color="grape" size="xs" 
                                leftSection={isScanning ? <IconRefresh size={14} className="spinning" /> : <IconSearch size={14} />}
                                onClick={(e) => { e.stopPropagation(); handleScan(); }}
                                loading={isScanning}
                            >
                                Scan Auto-Parse Path
                            </Button>
                        </Stack>
                    </Paper>
                </div>

                {results.length > 0 && (
                    <Stack gap="md">
                        <Group justify="space-between">
                            <Text fw={600}>Queue ({results.length})</Text>
                            <Group>
                                <Button 
                                    size="sm" 
                                    variant="outline" 
                                    color="blue" 
                                    leftSection={<IconRefresh size={18} className={isScanning ? "spinning" : ""} />}
                                    onClick={handleReparse}
                                    loading={isScanning}
                                >
                                    Re-parse Queue
                                </Button>
                                <Button 
                                    size="sm" color="grape" leftSection={<IconCloudUpload size={18} />}
                                    onClick={handleImportAll} loading={isImporting}
                                    disabled={!results.some(r => r.isValid && (r.status === 'pending' || r.status === 'error'))}
                                >
                                    Start Batch Import
                                </Button>
                                <ActionIcon variant="subtle" color="gray" onClick={() => setResults([])}>
                                    <IconX size={18} />
                                </ActionIcon>
                            </Group>
                        </Group>

                        <Table verticalSpacing="xs" withTableBorder>
                            <Table.Thead bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                                <Table.Tr>
                                    <Table.Th>Folder</Table.Th>
                                    <Table.Th>Parsed Data</Table.Th>
                                    <Table.Th w={100}>Status</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {results.map((result, index) => (
                                    <Table.Tr key={index} style={{ opacity: (result.status === 'success' || result.status === 'duplicate') ? 0.6 : 1 }}>
                                        <Table.Td>
                                            <Stack gap={0}>
                                                <Text size="sm" fw={500}>{result.source_path.split(/[\\/]/).pop()}</Text>
                                                <Text size="xs" c="dimmed" truncate ff="monospace">{result.source_path}</Text>
                                            </Stack>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs" grow>
                                                <TextInput 
                                                    label="Creator" size="xs" value={result.creator_name}
                                                    onChange={(e) => handleResultChange(index, 'creator_name', e.currentTarget.value)}
                                                    disabled={result.status !== 'pending' && result.status !== 'error'}
                                                />
                                                <TextInput 
                                                    label="Set Title" size="xs" value={result.set_title}
                                                    onChange={(e) => handleResultChange(index, 'set_title', e.currentTarget.value)}
                                                    disabled={result.status !== 'pending' && result.status !== 'error'}
                                                />
                                            </Group>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group justify="center">
                                                {result.status === 'pending' && (
                                                    result.isValid ? <Badge variant="dot" color="blue">Ready</Badge> : <Badge color="red">Invalid</Badge>
                                                )}
                                                {result.status === 'duplicate' && (
                                                    <Badge color="orange" variant="light">Duplicate</Badge>
                                                )}
                                                {result.status === 'success' && (
                                                    <ThemeIcon color="green" variant="light" radius="xl"><IconCheck size={16} /></ThemeIcon>
                                                )}
                                                {result.status === 'error' && (
                                                    <Tooltip label={result.error}>
                                                        <ThemeIcon color="red" variant="light" radius="xl" style={{ cursor: 'help' }}><IconX size={16} /></ThemeIcon>
                                                    </Tooltip>
                                                )}
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Stack>
                )}
            </Stack>
        </Card>
    );
}
