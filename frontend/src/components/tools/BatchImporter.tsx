/**
 * @file
 * Tool for batch importing image sets into the vault.
 * Supports drag-and-drop folders and background scanning with regex-based parsing.
 */
import { Text, Card, TextInput, Group, Stack, Table, Badge, ActionIcon, Tooltip, Paper, Switch, Button, ThemeIcon } from '@mantine/core';
import { IconSettings, IconCheck, IconX, IconCloudUpload, IconCrop, IconSearch, IconRefresh } from '@tabler/icons-react';
import { useBatchImportQueue } from './hooks/useBatchImportQueue';

const OPACITY_DIMMED = 0.6;
const OPACITY_FULL = 1;

export function BatchImporter() {
    const {
        template,
        setTemplate,
        results,
        setResults,
        isImporting,
        isScanning,
        globalDeleteSource,
        setGlobalDeleteSource,
        handleResultChange,
        handleDrop,
        handleScan,
        handleReparse,
        handleImportAll
    } = useBatchImportQueue();


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
                                    <Table.Tr key={index} style={{ opacity: (result.status === 'success' || result.status === 'duplicate') ? OPACITY_DIMMED : OPACITY_FULL }}>
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
