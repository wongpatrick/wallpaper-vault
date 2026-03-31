import { Text, Card, TextInput, Group, Stack, Table, Badge, ActionIcon, Tooltip, Paper, Switch, Code, Button, ThemeIcon } from '@mantine/core';
import { IconFolder, IconSettings, IconFileSearch, IconCheck, IconX, IconInfoCircle, IconRegex, IconCloudUpload } from '@tabler/icons-react';
import { useState, useCallback, useEffect } from 'react';
import { useImportSetApiSetsImportPost } from '../../api/generated/sets/sets';
import { getAllFiles } from '../../utils/fileUtils';


interface ParseResult {
    original: string;
    path: string;
    creator: string;
    set: string;
    isValid: boolean;
    files: string[];
}

export function FolderParser() {
    const [template, setTemplate] = useState('[Creator] - [Set]');
    const [isAdvanced, setIsAdvanced] = useState(false);
    const [droppedFolders, setDroppedFolders] = useState<{name: string, path: string, files: string[]}[]>([]);
    const [results, setResults] = useState<ParseResult[]>([]);
    const [isImporting, setIsImporting] = useState(false);

    const { mutateAsync: importSet } = useImportSetApiSetsImportPost();

    const parseFolderName = useCallback((folder: {name: string, path: string, files: string[]}, pattern: string, advanced: boolean): ParseResult => {
        try {
            let regex: RegExp;
            if (advanced) {
                regex = new RegExp(pattern);
            } else {
                const regexPattern = pattern
                    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/\\\[Creator\\\]/g, '(?<creator>.+)')
                    .replace(/\\\[Set\\\]/g, '(?<set>.+)');
                regex = new RegExp(`^${regexPattern}$`);
            }

            const match = folder.name.match(regex);
            if (match && match.groups) {
                return {
                    original: folder.name,
                    path: folder.path,
                    creator: match.groups.creator || 'Unknown',
                    set: match.groups.set || 'Unknown',
                    isValid: true,
                    files: folder.files
                };
            }
        } catch (e) {
            console.error("Regex error:", e);
        }

        return {
            original: folder.name,
            path: folder.path,
            creator: 'Unknown',
            set: 'Unknown',
            isValid: false,
            files: folder.files
        };
    }, []);

    useEffect(() => {
        const newResults = droppedFolders.map(folder => parseFolderName(folder, template, isAdvanced));
        setResults(newResults);
    }, [droppedFolders, template, isAdvanced, parseFolderName]);

    const handleResultChange = (index: number, field: 'creator' | 'set', value: string) => {
        setResults(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const templateToRegex = (t: string) => {
        return t
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\\\[Creator\\\]/g, '(?<creator>.+)')
            .replace(/\\\[Set\\\]/g, '(?<set>.+)');
    };

    const regexToTemplate = (r: string) => {
        return r
            .replace(/^\^/, '')
            .replace(/\$$/, '')
            .replace(/\(\?<creator>.*?\)/g, '[Creator]')
            .replace(/\(\?<set>.*?\)/g, '[Set]')
            .replace(/\\(.)/g, '$1');
    };

    const handleToggleAdvanced = (checked: boolean) => {
        if (checked) {
            setTemplate(templateToRegex(template));
        } else {
            setTemplate(regexToTemplate(template));
        }
        setIsAdvanced(checked);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        const items = Array.from(e.dataTransfer.items);
        const newFolders: {name: string, path: string, files: string[]}[] = [];

        for (const item of items) {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                const file = item.getAsFile();
                const absolutePath = (file as any)?.path || '';
                
                let setPath = absolutePath;
                if (entry.isFile && absolutePath) {
                    setPath = absolutePath.replace(/[\\/][^\\/]+$/, '');
                }

                const files = await getAllFiles(entry);
                
                if (entry.isDirectory || (entry.isFile && files.length > 0)) {
                    newFolders.push({
                        name: entry.name,
                        path: setPath || entry.name,
                        files: files
                    });
                }
            }
        }

        if (newFolders.length > 0) {
            setDroppedFolders(prev => {
                const existingPaths = new Set(prev.map(f => f.path));
                const uniqueNew = newFolders.filter(f => !existingPaths.has(f.path));
                return [...prev, ...uniqueNew];
            });
        }
    };

    const handleImport = async () => {
        const validResults = results.filter(r => r.isValid);
        if (validResults.length === 0) return;

        setIsImporting(true);
        let errorCount = 0;
        try {
            for (const result of validResults) {
                try {
                    await importSet({
                        data: {
                            title: result.set,
                            creator_names: [result.creator],
                            local_path: result.path,
                            images: result.files.map(f => {
                                const fullPath = `${result.path}/${f}`.replace(/\/+/g, '/');
                                return {
                                    filename: f.split(/[\\/]/).pop() || f,
                                    local_path: fullPath
                                };
                            })
                        }
                    });
                } catch (err: any) {
                    errorCount++;
                    const message = err.response?.data?.detail || err.message;
                    console.error(`Import failed for ${result.set}:`, message);
                }
            }
            
            if (errorCount === 0) {
                setDroppedFolders([]);
            } else {
                console.warn(`${errorCount} sets failed to import (likely duplicates).`);
            }
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Group justify="space-between" mb="lg">
                <Group>
                    <ThemeIcon size={40} radius="md" variant="light" color="blue">
                        <IconFileSearch size={24} />
                    </ThemeIcon>
                    <div>
                        <Text fw={700}>Configure Parser</Text>
                        <Text size="xs" c="dimmed">Set your naming patterns below.</Text>
                    </div>
                </Group>
                <Switch 
                    label="Advanced Mode (Regex)" 
                    checked={isAdvanced} 
                    onChange={(event) => handleToggleAdvanced(event.currentTarget.checked)}
                    thumbIcon={isAdvanced ? <IconRegex size={12} stroke={3} /> : null}
                />
            </Group>

            <Stack gap="md">
                <Paper 
                    withBorder 
                    p="md" 
                    radius="md" 
                    bg="var(--mantine-color-gray-0)"
                    style={{ borderStyle: 'dashed', borderWidth: 2 }}
                >
                    <Stack gap="xs">
                        <Group gap="xs">
                            <IconSettings size={18} />
                            <Text fw={500} size="sm">
                                {isAdvanced ? 'Regex Pattern' : 'Parsing Template'}
                            </Text>
                            <Tooltip label={isAdvanced 
                                ? "Use named groups: (?<creator>...) and (?<set>...)" 
                                : "Use [Creator] and [Set] as placeholders."}
                            >
                                <IconInfoCircle size={14} color="var(--mantine-color-gray-6)" />
                            </Tooltip>
                        </Group>
                        
                        <Stack gap="xs">
                            <TextInput 
                                value={template}
                                onChange={(e) => setTemplate(e.currentTarget.value)}
                                placeholder={isAdvanced ? "e.g. (?<creator>.+) - (?<set>.+)" : "e.g. [Creator] - [Set]"}
                                size="md"
                                radius="md"
                                ff={isAdvanced ? "monospace" : undefined}
                            />
                            {isAdvanced && (
                                <Text size="xs" c="dimmed">
                                    Must include named groups: <Code>(?&lt;creator&gt;...)</Code> and <Code>(?&lt;set&gt;...)</Code>
                                </Text>
                            )}
                        </Stack>
                    </Stack>
                </Paper>

                <div 
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    style={{ cursor: 'pointer' }}
                >
                    <Paper 
                        withBorder 
                        p={40} 
                        radius="md" 
                        bg="var(--mantine-color-blue-light)"
                        style={{ 
                            borderStyle: 'dashed', 
                            borderWidth: 2,
                            borderColor: 'var(--mantine-color-blue-4)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.2s ease'
                        }}
                    >
                        <IconFolder size={48} stroke={1.5} color="var(--mantine-color-blue-6)" />
                        <Text fw={500} mt="md">Drop folders here</Text>
                        <Text size="sm" c="dimmed">Files/Folders from your system</Text>
                    </Paper>
                </div>

                {results.length > 0 && (
                    <Stack gap="xs" mt="md">
                        <Group justify="space-between">
                            <Text fw={600}>Results ({results.length})</Text>
                            <Group>
                                <Button 
                                    size="xs" 
                                    leftSection={<IconCloudUpload size={16} />}
                                    onClick={handleImport}
                                    loading={isImporting}
                                    disabled={!results.some(r => r.isValid)}
                                >
                                    Import Valid Sets
                                </Button>
                                <ActionIcon variant="subtle" color="gray" onClick={() => setDroppedFolders([])}>
                                    <IconX size={18} />
                                </ActionIcon>
                            </Group>
                        </Group>
                        <Table verticalSpacing="sm" withColumnBorders withTableBorder>
                            <Table.Thead bg="var(--mantine-color-gray-0)">
                                <Table.Tr>
                                    <Table.Th>Original Name</Table.Th>
                                    <Table.Th>Creator</Table.Th>
                                    <Table.Th>Set</Table.Th>
                                    <Table.Th w={80}>Files</Table.Th>
                                    <Table.Th w={80}>Status</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {results.map((result, index) => (
                                    <Table.Tr key={index}>
                                        <Table.Td>
                                            <Stack gap={0}>
                                                <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>{result.original}</Text>
                                                <Text size="xs" c="dimmed" truncate>{result.path}</Text>
                                            </Stack>
                                        </Table.Td>
                                        <Table.Td>
                                            <TextInput 
                                                size="xs"
                                                value={result.creator}
                                                onChange={(e) => handleResultChange(index, 'creator', e.currentTarget.value)}
                                                variant={result.isValid ? "default" : "filled"}
                                                error={!result.isValid && result.creator === 'Unknown'}
                                            />
                                        </Table.Td>
                                        <Table.Td>
                                            <TextInput 
                                                size="xs"
                                                value={result.set}
                                                onChange={(e) => handleResultChange(index, 'set', e.currentTarget.value)}
                                                variant={result.isValid ? "default" : "filled"}
                                                error={!result.isValid && result.set === 'Unknown'}
                                            />
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge variant="light" color={result.files.length > 0 ? "blue" : "gray"}>
                                                {result.files.length}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group justify="center">
                                                {result.isValid ? (
                                                    <IconCheck size={20} color="var(--mantine-color-green-6)" />
                                                ) : (
                                                    <IconX size={20} color="var(--mantine-color-red-6)" />
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
