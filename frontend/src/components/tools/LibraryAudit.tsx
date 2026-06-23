/**
 * @file
 * Audits the library for integrity issues.
 * Identifies ghosts (missing files) and orphans (untracked files) and offers repair actions.
 */
import { useState, useEffect } from 'react';
import { 
    Stack, 
    Text, 
    Card, 
    Group, 
    Button, 
    Badge, 
    Table, 
    ActionIcon,
    Tooltip,
    Paper,
    Title,
    Progress,
    Select,
    Center,
    ScrollArea
} from '@mantine/core';
import { 
    IconTrash, 
    IconRefresh, 
    IconSearch,
    IconLink,
    IconLinkOff,
    IconFolder,
    IconPlus
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { 
    useStartAuditApiAuditStartPost,
    useGetAuditResultsApiAuditResultsGet,
    useResolveAuditIssuesApiAuditResolvePost
} from '../../api/generated/audit/audit';
import type { AuditIssue } from '../../api/model';
import { useTasks } from '../../hooks/useTasks';
import { PaginationWithSkip } from '../ui/PaginationWithSkip';

const ITEM_HEIGHT_PX = 35;
const MAX_SCROLL_HEIGHT_PX = 150;

export function LibraryAudit() {
    const { tasks } = useTasks();
    const auditTask = Object.values(tasks).find(
        (t) => t.id.startsWith('audit-') && t.status !== 'completed' && t.status !== 'error'
    );
    const isScanning = !!auditTask;
    const progress = auditTask?.progress || 0;
    const status = auditTask?.status === 'accepted' 
        ? 'Starting scan...' 
        : auditTask?.status === 'processing' 
        ? 'Scanning...' 
        : auditTask?.status || 'Processing...';

    const [page, setPage] = useState(1);
    const [issueType, setIssueType] = useState<string | null>(null);

    const startMutation = useStartAuditApiAuditStartPost();
    const resolveMutation = useResolveAuditIssuesApiAuditResolvePost();
    const { data: results, refetch, isFetching } = useGetAuditResultsApiAuditResultsGet({
        skip: (page - 1) * 20,
        limit: 20,
        issue_type: issueType || undefined
    });

    // Derive groups for Orphans
    const groupedOrphans = results?.items?.reduce((acc, issue) => {
        if (issue.issue_type !== 'orphan') return acc;
        const dir = issue.directory || 'Unknown';
        if (!acc[dir]) acc[dir] = [];
        acc[dir].push(issue);
        return acc;
    }, {} as Record<string, AuditIssue[]>) || {};

    const groupedDuplicates = results?.items?.reduce((acc, issue) => {
        if (issue.issue_type !== 'duplicate_entry') return acc;
        const dir = issue.directory || 'Unknown';
        if (!acc[dir]) acc[dir] = [];
        acc[dir].push(issue);
        return acc;
    }, {} as Record<string, AuditIssue[]>) || {};

    const otherIssues = results?.items?.filter(i => i.issue_type !== 'orphan' && i.issue_type !== 'duplicate_entry') || [];

    const handleStart = async () => {
        try {
            await startMutation.mutateAsync({ data: { deep_scan: false } });
        } catch {
            notifications.show({ title: 'Error', message: 'Failed to start audit.', color: 'red' });
        }
    };

    const taskStatus = auditTask?.status;

    // Refetch the integrity audit results when a scan completes successfully
    useEffect(() => {
        if (taskStatus === 'completed') {
            refetch();
        }
    }, [taskStatus, refetch]);

    const handleResolve = async (ids: number[], action: string) => {
        try {
            await resolveMutation.mutateAsync({
                data: {
                    issue_ids: ids,
                    action: action
                }
            });
            notifications.show({ title: 'Success', message: `Action '${action}' executed.`, color: 'green' });
            refetch();
        } catch {
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
                {!isScanning ? (
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

            {isScanning && (
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
                                { value: 'orphan', label: 'Orphans (Untracked)' },
                                { value: 'duplicate_entry', label: 'Shared Files (DB Duplicates)' },
                                { value: 'empty_set', label: 'Empty Sets (No Images)' },
                                { value: 'ghost_set', label: 'Ghost Sets (Folder Missing)' },
                                { value: 'corrupted_image', label: 'Corrupted Images (Unreadable)' },
                                { value: 'path_mismatch', label: 'Path Mismatches (Wrong Set Folder)' },
                                { value: 'orphan_tag', label: 'Orphan Tags (Unused)' },
                                { value: 'orphan_creator', label: 'Orphan Creators (Unused)' },
                                { value: 'orphan_character', label: 'Orphan Characters (Unused)' }
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
                                {/* Other Issues (Ghosts, Empty Sets, Ghost Sets, Corrupted, Path Mismatches, DB Orphans) */}
                                {otherIssues.map((issue) => {
                                    let badgeColor = "red";
                                    let badgeLabel = issue.issue_type;
                                    let badgeIcon = <IconLinkOff size={10} />;
                                    let displayPath = issue.path;
                                    let description = "";
                                    let actionButton = null;

                                    if (issue.issue_type === 'ghost') {
                                        badgeColor = "red";
                                        badgeLabel = "Ghost";
                                        badgeIcon = <IconLinkOff size={10} />;
                                        description = "Database entry exists, but file is missing on disk.";
                                        if (issue.match_issue_id) {
                                            description += " ✨ Visual match found! Can be repaired.";
                                            actionButton = (
                                                <Tooltip label="Repair Link">
                                                    <ActionIcon color="green" variant="light" onClick={() => handleResolve([issue.id], 'repair')}>
                                                        <IconLink size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            );
                                        } else {
                                            actionButton = (
                                                <Tooltip label="Purge Record">
                                                    <ActionIcon color="red" variant="light" onClick={() => handleResolve([issue.id], 'purge')}>
                                                        <IconTrash size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            );
                                        }
                                    } else if (issue.issue_type === 'empty_set') {
                                        badgeColor = "yellow";
                                        badgeLabel = "Empty Set";
                                        badgeIcon = <IconFolder size={10} />;
                                        description = `Set has no wallpapers.`;
                                        actionButton = (
                                            <Tooltip label="Purge Set Record">
                                                <ActionIcon color="red" variant="light" onClick={() => handleResolve([issue.id], 'purge')}>
                                                    <IconTrash size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                        );
                                    } else if (issue.issue_type === 'ghost_set') {
                                        badgeColor = "red";
                                        badgeLabel = "Ghost Set";
                                        badgeIcon = <IconFolder size={10} />;
                                        description = `Set folder does not exist on disk.`;
                                        actionButton = (
                                            <Tooltip label="Purge Set Record">
                                                <ActionIcon color="red" variant="light" onClick={() => handleResolve([issue.id], 'purge')}>
                                                    <IconTrash size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                        );
                                    } else if (issue.issue_type === 'corrupted_image') {
                                        badgeColor = "orange";
                                        badgeLabel = "Corrupted File";
                                        badgeIcon = <IconLinkOff size={10} />;
                                        description = `Image file is unreadable/corrupted.`;
                                        actionButton = (
                                            <Group gap="xs">
                                                <Tooltip label="Delete File & Record">
                                                     <ActionIcon color="red" variant="light" onClick={() => handleResolve([issue.id], 'delete_file')}>
                                                         <IconTrash size={16} />
                                                     </ActionIcon>
                                                 </Tooltip>
                                                 <Tooltip label="Purge DB Record Only">
                                                     <ActionIcon color="orange" variant="light" onClick={() => handleResolve([issue.id], 'purge')}>
                                                         <IconLinkOff size={16} />
                                                     </ActionIcon>
                                                 </Tooltip>
                                             </Group>
                                         );
                                    } else if (issue.issue_type === 'path_mismatch') {
                                        badgeColor = "indigo";
                                        badgeLabel = "Path Mismatch";
                                        badgeIcon = <IconFolder size={10} />;
                                        description = `Physical path does not reside in the set's folder.`;
                                        actionButton = (
                                             <Tooltip label="Re-associate Set">
                                                 <ActionIcon color="indigo" variant="light" onClick={() => handleResolve([issue.id], 'repair')}>
                                                     <IconLink size={16} />
                                                 </ActionIcon>
                                             </Tooltip>
                                         );
                                    } else if (issue.issue_type === 'orphan_tag') {
                                        badgeColor = "pink";
                                        badgeLabel = "Orphan Tag";
                                        badgeIcon = <IconLinkOff size={10} />;
                                        displayPath = issue.path.split(":")[0];
                                        description = `Tag is not associated with any images or sets. ID: ${issue.path.split(":")[1]}`;
                                        actionButton = (
                                            <Tooltip label="Purge Tag">
                                                <ActionIcon color="red" variant="light" onClick={() => handleResolve([issue.id], 'purge')}>
                                                    <IconTrash size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                        );
                                    } else if (issue.issue_type === 'orphan_creator') {
                                        badgeColor = "violet";
                                        badgeLabel = "Orphan Creator";
                                        badgeIcon = <IconLinkOff size={10} />;
                                        displayPath = issue.path.split(":")[0];
                                        description = `Creator is not associated with any sets. ID: ${issue.path.split(":")[1]}`;
                                        actionButton = (
                                            <Tooltip label="Purge Creator">
                                                <ActionIcon color="red" variant="light" onClick={() => handleResolve([issue.id], 'purge')}>
                                                    <IconTrash size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                        );
                                    } else if (issue.issue_type === 'orphan_character') {
                                        badgeColor = "cyan";
                                        badgeLabel = "Orphan Character";
                                        badgeIcon = <IconLinkOff size={10} />;
                                        displayPath = issue.path.split(":")[0];
                                        description = `Character is not associated with any sets. ID: ${issue.path.split(":")[1]}`;
                                        actionButton = (
                                            <Tooltip label="Purge Character">
                                                <ActionIcon color="red" variant="light" onClick={() => handleResolve([issue.id], 'purge')}>
                                                    <IconTrash size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                        );
                                    }

                                    return (
                                        <Table.Tr key={issue.id}>
                                            <Table.Td>
                                                <Badge color={badgeColor} leftSection={badgeIcon}>{badgeLabel}</Badge>
                                            </Table.Td>
                                            <Table.Td>
                                                <Stack gap={0}>
                                                    <Text size="sm" fw={500} truncate="end" maw={500}>{displayPath}</Text>
                                                    <Text size="xs" c="dimmed">{description}</Text>
                                                </Stack>
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge variant="outline" color="gray" size="xs">{issue.status}</Badge>
                                            </Table.Td>
                                            <Table.Td>
                                                <Group gap="xs">
                                                    {actionButton}
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })}

                                {/* Duplicates Header (if any) */}
                                {Object.keys(groupedDuplicates).length > 0 && (
                                    <Table.Tr bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                                        <Table.Td colSpan={4} py={10}>
                                            <Text fw={700} size="sm">Shared File References (DB Duplicates)</Text>
                                        </Table.Td>
                                    </Table.Tr>
                                )}

                                {/* Grouped Duplicates */}
                                {Object.entries(groupedDuplicates).map(([dir, items]) => (
                                    <Table.Tr key={dir}>
                                        <Table.Td colSpan={4}>
                                            <Paper 
                                                withBorder 
                                                p="xs" 
                                                radius="sm" 
                                                style={{
                                                    backgroundColor: 'var(--mantine-color-body)'
                                                }}
                                            >
                                                <Stack gap="xs">
                                                    <Group justify="space-between">
                                                        <Group gap="xs">
                                                            <IconFolder size={18} color="var(--mantine-color-orange-filled)" />
                                                            <div>
                                                                <Text size="sm" fw={600}>{dir.split(/[\\/]/).pop()}</Text>
                                                                <Text size="xs" c="dimmed" truncate="end" maw={400}>{dir}</Text>
                                                            </div>
                                                            <Badge color="orange" size="xs" variant="light">{items.length} redundant entries</Badge>
                                                        </Group>
                                                        <Button 
                                                            size="compact-xs" 
                                                            variant="light" 
                                                            color="blue" 
                                                            leftSection={<IconRefresh size={12} />}
                                                            onClick={() => handleResolve(items.map(i => i.id), 'purge')}
                                                        >
                                                            Clean Up All
                                                        </Button>
                                                    </Group>
                                                </Stack>
                                            </Paper>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}

                                {/* Orphans Header (if any) */}
                                {Object.keys(groupedOrphans).length > 0 && (
                                    <Table.Tr bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
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
                                                style={{
                                                    backgroundColor: 'var(--mantine-color-body)'
                                                }}
                                            >
                                                <Stack gap="xs">
                                                    <Group justify="space-between">
                                                        <Group gap="xs">
                                                            <IconFolder size={18} color="var(--mantine-color-blue-filled)" />
                                                            <div>
                                                                <Text size="sm" fw={600}>{dir.split(/[\\/]/).pop()}</Text>
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
                                                    
                                                    <ScrollArea h={Math.min(items.length * ITEM_HEIGHT_PX, MAX_SCROLL_HEIGHT_PX)} scrollbarSize={6}>
                                                        <Stack gap={2}>
                                                            {items.map(item => (
                                                                <Group 
                                                                    key={item.id} 
                                                                    justify="space-between" 
                                                                    wrap="nowrap" 
                                                                    py={2}
                                                                    style={{
                                                                        borderRadius: 4,
                                                                        padding: '0 8px',
                                                                        background: 'var(--mantine-color-default)'
                                                                    }}
                                                                >
                                                                    <Text size="xs" truncate="end" c="dimmed" style={{ flex: 1 }}>{item.path.split(/[\\/]/).pop()}</Text>
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
                        <Group justify="center" mt="md">
                            <PaginationWithSkip 
                                total={Math.ceil(results.total / 20)} 
                                value={page} 
                                onChange={setPage} 
                            />
                        </Group>
                    )}
                </Stack>
            </Card>
        </Stack>
    );
}
