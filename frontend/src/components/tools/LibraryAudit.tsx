import { useState, useEffect } from 'react';
import { 
    Stack, 
    Text, 
    Card, 
    Group, 
    Button, 
    Badge, 
    Table, 
    Loader, 
    Alert, 
    ActionIcon,
    Tooltip,
    Paper,
    Divider,
    Title,
    Progress,
    Pagination,
    Select,
    rem,
    Center,
    ScrollArea
} from '@mantine/core';
import { 
    IconAlertCircle, 
    IconCheck, 
    IconTrash, 
    IconRefresh, 
    IconSearch,
    IconLink,
    IconLinkOff,
    IconFileUnknown,
    IconFolder,
    IconPlus
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { 
    useStartAuditApiAuditStartPost,
    useGetAuditResultsApiAuditResultsGet,
    useResolveAuditIssuesApiAuditResolvePost,
    useGetCurrentAuditApiAuditCurrentGet
} from '../../api/generated/audit/audit';

export function LibraryAudit() {
    const [taskId, setTaskId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [issueType, setIssueType] = useState<string | null>(null);

    const startMutation = useStartAuditApiAuditStartPost();
    const resolveMutation = useResolveAuditIssuesApiAuditResolvePost();
    const { data: currentAudit } = useGetCurrentAuditApiAuditCurrentGet({
        query: {
            staleTime: 0,
            refetchOnWindowFocus: true
        }
    });

    const { data: results, refetch, isFetching } = useGetAuditResultsApiAuditResultsGet({
        skip: (page - 1) * 20,
        limit: 20,
        issue_type: issueType || undefined
    });

    // Check for running audit on mount
    useEffect(() => {
        if (currentAudit?.task_id && !taskId) {
            setTaskId(currentAudit.task_id);
            setProgress(currentAudit.progress || 0);
            setStatus("Resuming scan...");
        }
    }, [currentAudit]);

    // Derive groups for Orphans
    const groupedOrphans = results?.items?.reduce((acc, issue) => {
        if (issue.issue_type !== 'orphan') return acc;
        const dir = issue.directory || 'Unknown';
        if (!acc[dir]) acc[dir] = [];
        acc[dir].push(issue);
        return acc;
    }, {} as Record<string, any[]>) || {};

    const otherIssues = results?.items?.filter(i => i.issue_type !== 'orphan') || [];

    const handleStart = async () => {
        try {
            const res = await startMutation.mutateAsync({ data: { deep_scan: false } });
            setTaskId(res.task_id);
            setProgress(0);
            setStatus("Starting scan...");
        } catch (error) {
            notifications.show({ title: 'Error', message: 'Failed to start audit.', color: 'red' });
        }
    };

    // SSE Listener for Task Progress
    useEffect(() => {
        if (!taskId) return;

        const eventSource = new EventSource('http://localhost:8000/api/sets/events');
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data[taskId]) {
                const task = data[taskId];
                setProgress(task.progress || 0);
                setStatus(task.status || "Processing...");
                
                if (task.status === 'completed') {
                    setTaskId(null);
                    refetch();
                    notifications.show({ 
                        title: 'Audit Complete', 
                        message: 'Library scan finished successfully.', 
                        color: 'green',
                        icon: <IconCheck size={16} />
                    });
                    eventSource.close();
                } else if (task.status === 'error') {
                    setTaskId(null);
                    notifications.show({ title: 'Error', message: task.error_message || 'Scan failed', color: 'red' });
                    eventSource.close();
                }
            }
        };

        return () => eventSource.close();
    }, [taskId]);

    const handleResolve = async (ids: number[], action: string) => {
        try {
            await resolveMutation.mutateAsync({
                data: {
                    issue_ids: ids,
                    action: action as any
                }
            });
            notifications.show({ title: 'Success', message: `Action '${action}' executed.`, color: 'green' });
            refetch();
        } catch (error) {
            notifications.show({ title: 'Error', message: 'Failed to execute resolution.', color: 'red' });
        }
    };

    return (
        <Stack gap="xl">
            <Group justify="space-between">
                <div>
                    <Title order={2}>Library Integrity Audit</Title>
                    <Text c="dimmed" size="sm">
                        Find and fix broken database records (Ghosts) and untracked filesystem images (Orphans).
                    </Text>
                </div>
                {!taskId ? (
                    <Button 
                        leftSection={<IconSearch size={16} />} 
                        onClick={handleStart}
                        loading={startMutation.isPending}
                    >
                        Start New Audit
                    </Button>
                ) : (
                    <Button variant="light" color="orange" disabled>Scan in Progress...</Button>
                )}
            </Group>

            {taskId && (
                <Paper withBorder p="md" radius="md">
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text size="sm" fw={500}>{status}</Text>
                            <Text size="xs" c="dimmed">{progress}%</Text>
                        </Group>
                        <Progress value={progress} animated color="blue" />
                    </Stack>
                </Paper>
            )}

            <Card withBorder radius="md">
                <Stack gap="md">
                    <Group justify="space-between">
                        <Select 
                            placeholder="All Issues"
                            data={[
                                { value: 'ghost', label: 'Ghosts (File Missing)' },
                                { value: 'orphan', label: 'Orphans (Untracked)' }
                            ]}
                            clearable
                            value={issueType}
                            onChange={setIssueType}
                            size="sm"
                            w={200}
                        />
                        <Button variant="subtle" size="xs" onClick={() => refetch()} leftSection={<IconRefresh size={14} />}>Refresh</Button>
                    </Group>

                    <Table.ScrollContainer minWidth={800}>
                        <Table verticalSpacing="xs">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Type</Table.Th>
                                    <Table.Th>Path / Record</Table.Th>
                                    <Table.Th>Status</Table.Th>
                                    <Table.Th>Action</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {/* Ghosts Section */}
                                {otherIssues.map((issue) => (
                                    <Table.Tr key={issue.id}>
                                        <Table.Td>
                                            <Badge color="red" leftSection={<IconLinkOff size={10} />}>Ghost</Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Stack gap={0}>
                                                <Text size="sm" fw={500} truncate="end" maw={500}>{issue.path}</Text>
                                                {issue.match_issue_id && (
                                                    <Text size="xs" c="green" fw={600}>
                                                        ✨ Visual match found! Can be repaired.
                                                    </Text>
                                                )}
                                            </Stack>
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge variant="outline" color="gray" size="xs">{issue.status}</Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                {issue.match_issue_id ? (
                                                    <Tooltip label="Repair Link">
                                                        <ActionIcon color="green" variant="light" onClick={() => handleResolve([issue.id], 'repair')}>
                                                            <IconLink size={16} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip label="Purge Record">
                                                        <ActionIcon color="red" variant="light" onClick={() => handleResolve([issue.id], 'purge')}>
                                                            <IconTrash size={16} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                )}
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}

                                {/* Orphans Header (if any) */}
                                {Object.keys(groupedOrphans).length > 0 && (
                                    <Table.Tr bg="var(--mantine-color-gray-0)">
                                        <Table.Td colSpan={4} py={10}>
                                            <Text fw={700} size="sm">Untracked Image Folders (Orphans)</Text>
                                        </Table.Td>
                                    </Table.Tr>
                                )}

                                {/* Grouped Orphans */}
                                {Object.entries(groupedOrphans).map(([dir, items]) => (
                                    <Table.Tr key={dir}>
                                        <Table.Td colSpan={4}>
                                            <Paper 
                                                withBorder 
                                                p="xs" 
                                                radius="sm" 
                                                style={(theme) => ({
                                                    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.white
                                                })}
                                            >
                                                <Stack gap="xs">
                                                    <Group justify="space-between">
                                                        <Group gap="xs">
                                                            <IconFolder size={18} color="var(--mantine-color-blue-filled)" />
                                                            <div>
                                                                <Text size="sm" fw={600}>{dir.split(/[\\\/]/).pop()}</Text>
                                                                <Text size="xs" c="dimmed" truncate="end" maw={400}>{dir}</Text>
                                                            </div>
                                                            <Badge size="xs" variant="light">{items.length} files</Badge>
                                                        </Group>
                                                        <Group gap="xs">
                                                            {items[0].set_id ? (
                                                                <Button 
                                                                    size="compact-xs" 
                                                                    variant="light" 
                                                                    color="green" 
                                                                    leftSection={<IconPlus size={12} />}
                                                                    onClick={() => handleResolve(items.map(i => i.id), 'import')}
                                                                >
                                                                    Import All to Set
                                                                </Button>
                                                            ) : (
                                                                <Button 
                                                                    size="compact-xs" 
                                                                    variant="light" 
                                                                    color="blue" 
                                                                    leftSection={<IconPlus size={12} />}
                                                                    onClick={() => handleResolve(items.map(i => i.id), 'create_and_import')}
                                                                >
                                                                    Import All as New Set
                                                                </Button>
                                                            )}
                                                            <Button 
                                                                size="compact-xs" 
                                                                variant="light" 
                                                                color="red" 
                                                                leftSection={<IconTrash size={12} />}
                                                                onClick={() => handleResolve(items.map(i => i.id), 'delete_file')}
                                                            >
                                                                Delete All
                                                            </Button>
                                                        </Group>
                                                    </Group>
                                                    
                                                    <ScrollArea h={Math.min(items.length * 35, 150)} scrollbarSize={6}>
                                                        <Stack gap={2}>
                                                            {items.map(item => (
                                                                <Group 
                                                                    key={item.id} 
                                                                    justify="space-between" 
                                                                    wrap="nowrap" 
                                                                    py={2}
                                                                    style={(theme) => ({
                                                                        borderRadius: 4,
                                                                        padding: '0 8px',
                                                                        background: theme.colorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[0]
                                                                    })}
                                                                >
                                                                    <Text size="xs" truncate="end" c="dimmed" style={{ flex: 1 }}>{item.path.split(/[\\\/]/).pop()}</Text>
                                                                    <Group gap={2}>
                                                                        <ActionIcon 
                                                                            size="xs" 
                                                                            color={item.set_id ? "green" : "blue"} 
                                                                            variant="subtle" 
                                                                            onClick={() => handleResolve([item.id], item.set_id ? 'import' : 'create_and_import')}
                                                                        >
                                                                            <IconPlus size={12} />
                                                                        </ActionIcon>
                                                                        <ActionIcon size="xs" color="red" variant="subtle" onClick={() => handleResolve([item.id], 'delete_file')}>
                                                                            <IconTrash size={12} />
                                                                        </ActionIcon>
                                                                    </Group>
                                                                </Group>
                                                            ))}
                                                        </Stack>
                                                    </ScrollArea>
                                                </Stack>
                                            </Paper>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}

                                {(!results?.items || results.items.length === 0) && !isFetching && (
                                    <Table.Tr>
                                        <Table.Td colSpan={4}>
                                            <Center py="xl">
                                                <Text c="dimmed">No issues found in your library.</Text>
                                            </Center>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>

                    {results && results.total > 20 && (
                        <Pagination 
                            total={Math.ceil(results.total / 20)} 
                            value={page} 
                            onChange={setPage} 
                            mt="md" 
                            justify="center" 
                        />
                    )}
                </Stack>
            </Card>
        </Stack>
    );
}
