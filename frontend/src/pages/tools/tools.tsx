import { Title, Text, Container, Card, TextInput, Group, Stack, Table, Badge, ActionIcon, Tooltip, Paper, Switch, Code } from '@mantine/core';
import { IconFolder, IconSettings, IconFileSearch, IconCheck, IconX, IconInfoCircle, IconRegex } from '@tabler/icons-react';
import { useState, useMemo } from 'react';

interface ParseResult {
    original: string;
    creator: string;
    set: string;
    isValid: boolean;
}

export default function Tools() {
    const [template, setTemplate] = useState('[Creator] - [Set]');
    const [isAdvanced, setIsAdvanced] = useState(false);
    const [droppedFolders, setDroppedFolders] = useState<string[]>([]);

    // Convert Template -> Regex
    const templateToRegex = (t: string) => {
        return t
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\\\[Creator\\\]/g, '(?<creator>.+)')
            .replace(/\\\[Set\\\]/g, '(?<set>.+)');
    };

    // Convert Regex -> Template (Best effort)
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
            // Moving to Advanced: Transform template to regex
            setTemplate(templateToRegex(template));
        } else {
            // Moving to Simple: Transform regex to template
            setTemplate(regexToTemplate(template));
        }
        setIsAdvanced(checked);
    };

    // Parsing logic
    const results = useMemo<ParseResult[]>(() => {
        return droppedFolders.map(folderName => {
            try {
                let regex: RegExp;

                if (isAdvanced) {
                    regex = new RegExp(template); // Now using shared 'template' state for both
                } else {
                    if (!template.includes('[Creator]') || !template.includes('[Set]')) {
                        return { original: folderName, creator: 'Unknown', set: 'Unknown', isValid: false };
                    }
                    regex = new RegExp(`^${templateToRegex(template)}$`);
                }

                const match = folderName.match(regex);

                if (match && match.groups) {
                    return {
                        original: folderName,
                        creator: match.groups.creator || 'Unknown',
                        set: match.groups.set || 'Unknown',
                        isValid: true
                    };
                }
            } catch (e) {
                console.error("Regex error:", e);
            }

            return {
                original: folderName,
                creator: 'Unknown',
                set: 'Unknown',
                isValid: false
            };
        });
    }, [template, isAdvanced, droppedFolders]);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const items = Array.from(e.dataTransfer.items);
        const folderNames: string[] = [];

        items.forEach(item => {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    folderNames.push(file.name);
                }
            }
        });

        if (folderNames.length > 0) {
            setDroppedFolders(prev => [...new Set([...prev, ...folderNames])]);
        }
    };

    return (
        <Container size="xl">
            <Stack gap="xl">
                <div>
                    <Title order={1} mb="xs">🛠️ Wallpaper Tools</Title>
                    <Text c="dimmed">Automation and utility scripts to manage your collection.</Text>
                </div>

                <Card shadow="sm" padding="xl" radius="md" withBorder>
                    <Group justify="space-between" mb="lg">
                        <Group>
                            <IconFileSearch size={28} color="var(--mantine-color-blue-6)" />
                            <div>
                                <Title order={3}>Folder Parser</Title>
                                <Text size="sm" c="dimmed">Identify Creators and Sets from folder names.</Text>
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
                                    <ActionIcon variant="subtle" color="gray" onClick={() => setDroppedFolders([])}>
                                        <IconX size={18} />
                                    </ActionIcon>
                                </Group>
                                <Table verticalSpacing="sm" withColumnBorders withTableBorder>
                                    <Table.Thead bg="var(--mantine-color-gray-0)">
                                        <Table.Tr>
                                            <Table.Th>Original Name</Table.Th>
                                            <Table.Th>Creator</Table.Th>
                                            <Table.Th>Set</Table.Th>
                                            <Table.Th w={80}>Status</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {results.map((result, index) => (
                                            <Table.Tr key={index}>
                                                <Table.Td><Text size="sm" ff="monospace">{result.original}</Text></Table.Td>
                                                <Table.Td>
                                                    <Badge variant="light" color={result.isValid ? "blue" : "gray"}>
                                                        {result.creator}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge variant="light" color={result.isValid ? "cyan" : "gray"}>
                                                        {result.set}
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
            </Stack>
        </Container>
    );
}
