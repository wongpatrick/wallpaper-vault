/**
 * @file
 * Tool for resolving duplicate and near-duplicate images in the library.
 * Allows comparing identical or visually similar images side-by-side and selecting which to keep.
 */
import { useState } from 'react';
import { 
    Stack, 
    Text, 
    Card, 
    Group, 
    Image, 
    Button, 
    Badge, 
    SimpleGrid, 
    Loader, 
    Alert, 
    ActionIcon, 
    Tooltip, 
    Paper, 
    Divider, 
    Title, 
    Pagination,
    SegmentedControl,
    Modal,
    Table
} from '@mantine/core';
import { 
    IconAlertCircle, 
    IconCheck, 
    IconTrash, 
    IconLayoutGrid, 
    IconColumns, 
    IconFolderOpen,
    IconEye,
    IconAdjustmentsHorizontal
} from '@tabler/icons-react';
import { useAppNotifications } from '../../hooks/useAppNotifications';
import { 
    useRevealImageApiImagesImageIdRevealPost 
} from '../../api/generated/images/images';
import type { DuplicateGroup, ImageWithContext } from '../../api/model';
import { useDuplicateScanner } from './hooks/useDuplicateScanner';
import { API_BASE_URL } from '../../config';

const API_BASE = `${API_BASE_URL}/api`;

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
const THRESHOLD_MB = 1000;
const DEFAULT_NEAR_SIMILARITY_PERCENT = 95;

export function DuplicateManager() {
    const {
        groups,
        isLoading,
        isError,
        refetch,
        resolving,
        viewMode,
        setViewMode,
        page,
        setPage,
        totalPages,
        ITEMS_PER_PAGE,
        maxDistance,
        setMaxDistance,
        handleDismissGroup,
        handleResolve
    } = useDuplicateScanner();

    const [inspectGroup, setInspectGroup] = useState<DuplicateGroup | null>(null);

    const paginatedGroups = groups?.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE) || [];

    return (
        <Stack gap="xl">
            <Group justify="space-between" align="flex-start" wrap="wrap">
                <div>
                    <Title order={2}>Visual Similarity & Duplicate Auditor</Title>
                    <Text c="dimmed" size="sm">
                        {maxDistance === 0 
                            ? 'Scanning for bitwise identical duplicate wallpapers.' 
                            : `Scanning for near-duplicate wallpapers within ${maxDistance} bits Hamming distance.`}
                    </Text>
                </div>
                <Group gap="sm" wrap="wrap">
                    <Tooltip label="Switch View">
                        <ActionIcon.Group>
                            <ActionIcon 
                                variant={viewMode === 'grid' ? 'filled' : 'default'} 
                                onClick={() => setViewMode('grid')}
                                size="lg"
                            >
                                <IconLayoutGrid size={20} />
                            </ActionIcon>
                            <ActionIcon 
                                variant={viewMode === 'columns' ? 'filled' : 'default'} 
                                onClick={() => setViewMode('columns')}
                                size="lg"
                            >
                                <IconColumns size={20} />
                            </ActionIcon>
                        </ActionIcon.Group>
                    </Tooltip>
                    <Button variant="outline" onClick={() => { setPage(1); refetch(); }}>Refresh</Button>
                </Group>
            </Group>

            <Paper withBorder p="md" radius="md">
                <Stack gap="xs">
                    <Group justify="space-between" wrap="wrap">
                        <Group gap="xs">
                            <IconAdjustmentsHorizontal size={18} color="var(--mantine-color-blue-filled)" />
                            <Text fw={600} size="sm">Similarity Sensitivity:</Text>
                        </Group>
                        <SegmentedControl
                            value={String(maxDistance)}
                            onChange={(val) => setMaxDistance(Number(val))}
                            data={[
                                { label: 'Exact (100%)', value: '0' },
                                { label: 'Very High (97%)', value: '2' },
                                { label: 'High (94%)', value: '4' },
                                { label: 'Moderate (91%)', value: '6' },
                                { label: 'Broad (88%)', value: '8' },
                            ]}
                            size="xs"
                        />
                    </Group>
                    <Text size="xs" c="dimmed">
                        Higher distance thresholds catch crops, compression artifacts, and color edits, but may surface intentional character variants.
                    </Text>
                </Stack>
            </Paper>

            {isLoading && (
                <Stack align="center" py="xl">
                    <Loader size="xl" />
                    <Text c="dimmed">
                        {maxDistance === 0 
                            ? 'Scanning for visually identical images...' 
                            : 'Analyzing perceptual hashes and Hamming distances...'}
                    </Text>
                </Stack>
            )}

            {isError && !isLoading && (
                <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
                    Failed to load duplicate groups. Please ensure the backend is running.
                </Alert>
            )}

            {!isLoading && !isError && groups.length === 0 && (
                <Paper withBorder p="xl" radius="md" style={{ textAlign: 'center' }}>
                    <Stack gap="sm">
                        <IconCheck size={48} color="var(--mantine-color-green-filled)" style={{ margin: '0 auto' }} />
                        <Title order={3}>No duplicates found!</Title>
                        <Text c="dimmed">
                            {maxDistance === 0 
                                ? 'Your library is visually unique with no exact duplicates.' 
                                : `No near-duplicates found at the selected threshold (distance ≤ ${maxDistance}).`}
                        </Text>
                        <Button variant="light" onClick={() => refetch()} mt="md">Refresh</Button>
                    </Stack>
                </Paper>
            )}

            {!isLoading && !isError && groups.length > 0 && (
                <>
                    <Text size="sm" c="dimmed">
                        Found {groups.length} duplicate group{groups.length === 1 ? '' : 's'}. We recommend keeping the highest resolution version.
                    </Text>

                    <Stack gap="lg">
                        {paginatedGroups.map((group) => {
                            const groupKey = group.group_id || group.phash;
                            return (
                                <DuplicateGroupCard 
                                    key={groupKey} 
                                    group={group} 
                                    onResolve={handleResolve}
                                    onDismiss={handleDismissGroup}
                                    onInspect={() => setInspectGroup(group)}
                                    isResolving={resolving === groupKey}
                                    viewMode={viewMode}
                                />
                            );
                        })}
                    </Stack>

                    {totalPages > 1 && (
                        <Group justify="center" mt="md">
                            <Pagination total={totalPages} value={page} onChange={setPage} />
                        </Group>
                    )}
                </>
            )}

            {inspectGroup && (
                <DuplicateInspectModal 
                    group={inspectGroup}
                    opened={Boolean(inspectGroup)}
                    onClose={() => setInspectGroup(null)}
                    onResolve={(g, keepId) => {
                        handleResolve(g, keepId);
                        setInspectGroup(null);
                    }}
                />
            )}
        </Stack>
    );
}

interface GroupCardProps {
    group: DuplicateGroup;
    onResolve: (group: DuplicateGroup, keepId: number) => void;
    onDismiss: (groupId: string) => void;
    onInspect: () => void;
    isResolving: boolean;
    viewMode: 'grid' | 'columns';
}

function DuplicateGroupCard({ 
    group, 
    onResolve, 
    onDismiss, 
    onInspect, 
    isResolving, 
    viewMode 
}: GroupCardProps) {
    const [selectedKeepId, setSelectedKeepId] = useState<number>(group.recommended_keep_id);
    const groupKey = group.group_id || group.phash;
    const isExact = (group.max_distance ?? 0) === 0;

    return (
        <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
            <Group p="md" justify="space-between" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))" wrap="wrap">
                <Group gap="sm" wrap="wrap">
                    {isExact ? (
                        <Badge color="blue" variant="filled">Exact Match (100%)</Badge>
                    ) : (
                        <Badge color="orange" variant="light">
                            {group.similarity_percentage ?? DEFAULT_NEAR_SIMILARITY_PERCENT}% Similar ({group.max_distance} bits diff)
                        </Badge>
                    )}
                    <Badge color="gray" variant="outline">{group.images.length} Versions</Badge>
                    <Text size="xs" c="dimmed" ff="monospace">#{group.phash.substring(0, 8)}</Text>
                </Group>
                <Group gap="xs">
                    <Button 
                        variant="subtle" 
                        color="gray"
                        size="xs"
                        leftSection={<IconCheck size={14} />}
                        onClick={() => onDismiss(groupKey)}
                    >
                        Keep Both (Ignore)
                    </Button>
                    <Button 
                        variant="light" 
                        color="blue"
                        size="xs"
                        leftSection={<IconEye size={14} />}
                        onClick={onInspect}
                    >
                        Inspect
                    </Button>
                    <Button 
                        color="red" 
                        leftSection={<IconTrash size={16} />} 
                        loading={isResolving}
                        onClick={() => onResolve(group, selectedKeepId)}
                        size="xs"
                    >
                        Resolve Group
                    </Button>
                </Group>
            </Group>

            <Divider />

            <div style={{ padding: 'var(--mantine-spacing-md)' }}>
                <SimpleGrid cols={viewMode === 'grid' ? { base: 1, sm: 2, md: 3 } : 1} spacing="md">
                    {group.images.map((img) => (
                        <ImageVariantCard 
                            key={img.id} 
                            image={img} 
                            isKeep={selectedKeepId === img.id}
                            isRecommended={group.recommended_keep_id === img.id}
                            onSelect={() => setSelectedKeepId(img.id)}
                        />
                    ))}
                </SimpleGrid>
            </div>
        </Card>
    );
}

interface VariantCardProps {
    image: ImageWithContext;
    isKeep: boolean;
    isRecommended: boolean;
    onSelect: () => void;
}

function ImageVariantCard({ image, isKeep, isRecommended, onSelect }: VariantCardProps) {
    const { showNotification } = useAppNotifications();
    const revealMutation = useRevealImageApiImagesImageIdRevealPost();

    const handleReveal = (e: React.MouseEvent) => {
        e.stopPropagation();
        revealMutation.mutate({ imageId: image.id }, {
            onSuccess: () => {
                showNotification({
                    title: 'Success',
                    message: 'Opened folder in explorer',
                    color: 'green',
                    icon: <IconFolderOpen size={16} />
                });
            },
            onError: () => {
                showNotification({
                    title: 'Error',
                    message: 'Failed to open folder',
                    color: 'red',
                    icon: <IconAlertCircle size={16} />
                });
            }
        });
    };

    return (
        <Paper 
            withBorder 
            p="xs" 
            radius="md" 
            style={{ 
                borderColor: isKeep ? 'var(--mantine-color-blue-filled)' : undefined,
                backgroundColor: isKeep ? 'var(--mantine-color-blue-light)' : undefined,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
            }}
            onClick={onSelect}
        >
            <Stack gap="xs">
                <div style={{ position: 'relative' }}>
                    <Image 
                        src={`${API_BASE}/images/thumb/${image.id}?size=md`} 
                        radius="sm" 
                        h={180} 
                        fallbackSrc="https://placehold.co/600x400?text=No+Image"
                        style={{ objectFit: 'cover' }}
                    />
                    <Tooltip label="Open in Explorer" position="right">
                        <ActionIcon 
                            variant="filled" 
                            color="dark"
                            opacity={0.8}
                            onClick={handleReveal}
                            style={{ position: 'absolute', top: 8, left: 8 }}
                            size="sm"
                            loading={revealMutation.isPending}
                        >
                            <IconFolderOpen size={14} />
                        </ActionIcon>
                    </Tooltip>
                    {isRecommended && (
                        <Badge 
                            color="green" 
                            variant="filled" 
                            style={{ position: 'absolute', top: 8, right: 8 }}
                            size="xs"
                        >
                            Recommended
                        </Badge>
                    )}
                    {isKeep && (
                        <div style={{ 
                            position: 'absolute', 
                            top: 0, 
                            left: 0, 
                            right: 0, 
                            bottom: 0, 
                            border: '3px solid var(--mantine-color-blue-filled)',
                            borderRadius: 'var(--mantine-radius-sm)',
                            pointerEvents: 'none'
                        }} />
                    )}
                </div>

                <Stack gap={2}>
                    <Tooltip label={image.filename} position="top" openDelay={300} multiline w={300}>
                        <Text fw={700} size="sm" truncate="end">{image.filename}</Text>
                    </Tooltip>
                    <Tooltip label={image.creator_names.join(' & ')} position="top" openDelay={300}>
                        <Text size="xs" c="dimmed" truncate="end">{image.creator_names.join(' & ') || 'Unknown Creator'}</Text>
                    </Tooltip>
                    <Tooltip label={image.set_title} position="top" openDelay={300}>
                        <Text size="xs" c="dimmed" fw={500} truncate="end">{image.set_title || 'No Set'}</Text>
                    </Tooltip>
                </Stack>

                <Divider variant="dashed" />

                <Group justify="space-between">
                    <Text size="xs" fw={700}>{image.width} × {image.height}</Text>
                    <Text size="xs" c="dimmed">
                        {(image.file_size || 0) / BYTES_PER_KB > THRESHOLD_MB 
                            ? `${((image.file_size || 0) / BYTES_PER_KB / BYTES_PER_KB).toFixed(1)} MB` 
                            : `${((image.file_size || 0) / BYTES_PER_KB).toFixed(0)} KB`}
                    </Text>
                </Group>

                <Button 
                    variant={isKeep ? 'filled' : 'light'} 
                    size="compact-xs" 
                    fullWidth
                    leftSection={isKeep ? <IconCheck size={12} /> : undefined}
                >
                    {isKeep ? 'Keeping This' : 'Keep This One'}
                </Button>
            </Stack>
        </Paper>
    );
}

interface InspectModalProps {
    group: DuplicateGroup;
    opened: boolean;
    onClose: () => void;
    onResolve: (group: DuplicateGroup, keepId: number) => void;
}

function DuplicateInspectModal({ group, opened, onClose, onResolve }: InspectModalProps) {
    const [selectedKeepId, setSelectedKeepId] = useState<number>(group.recommended_keep_id);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            size="90%"
            title={
                <Group gap="sm">
                    <Text fw={700} size="lg">Side-by-Side Duplicate Comparison</Text>
                    {(group.max_distance ?? 0) === 0 ? (
                        <Badge color="blue">Exact Match</Badge>
                    ) : (
                        <Badge color="orange">
                            {group.similarity_percentage ?? DEFAULT_NEAR_SIMILARITY_PERCENT}% Similar ({group.max_distance} bits diff)
                        </Badge>
                    )}
                </Group>
            }
        >
            <Stack gap="lg">
                <SimpleGrid cols={{ base: 1, sm: group.images.length > 2 ? 3 : 2 }} spacing="md">
                    {group.images.map((img) => {
                        const isKeep = selectedKeepId === img.id;
                        return (
                            <Paper 
                                key={img.id} 
                                withBorder 
                                p="md" 
                                radius="md"
                                style={{
                                    borderColor: isKeep ? 'var(--mantine-color-blue-filled)' : undefined,
                                    backgroundColor: isKeep ? 'var(--mantine-color-blue-light)' : undefined,
                                }}
                            >
                                <Stack gap="sm">
                                    <Image 
                                        src={`${API_BASE}/images/file/${img.id}`} 
                                        fallbackSrc={`${API_BASE}/images/thumb/${img.id}?size=lg`}
                                        h={320} 
                                        radius="sm" 
                                        style={{ objectFit: 'contain', backgroundColor: 'rgba(0,0,0,0.2)' }}
                                    />
                                    <Button 
                                        variant={isKeep ? 'filled' : 'light'} 
                                        size="xs" 
                                        fullWidth
                                        leftSection={isKeep ? <IconCheck size={14} /> : undefined}
                                        onClick={() => setSelectedKeepId(img.id)}
                                    >
                                        {isKeep ? 'Selected to Keep' : 'Select to Keep'}
                                    </Button>
                                    <Table fz="xs" striped withTableBorder>
                                        <Table.Tbody>
                                            <Table.Tr>
                                                <Table.Td fw={600}>Filename</Table.Td>
                                                <Table.Td style={{ wordBreak: 'break-all' }}>{img.filename}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td fw={600}>Dimensions</Table.Td>
                                                <Table.Td>{img.width} × {img.height}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td fw={600}>File Size</Table.Td>
                                                <Table.Td>
                                                    {((img.file_size || 0) / BYTES_PER_MB).toFixed(2)} MB
                                                </Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td fw={600}>Set</Table.Td>
                                                <Table.Td>{img.set_title || 'None'}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td fw={600}>Creator</Table.Td>
                                                <Table.Td>{img.creator_names.join(', ') || 'None'}</Table.Td>
                                            </Table.Tr>
                                        </Table.Tbody>
                                    </Table>
                                </Stack>
                            </Paper>
                        );
                    })}
                </SimpleGrid>

                <Group justify="flex-end" gap="sm">
                    <Button variant="default" onClick={onClose}>Close</Button>
                    <Button 
                        color="red" 
                        leftSection={<IconTrash size={16} />}
                        onClick={() => onResolve(group, selectedKeepId)}
                    >
                        Keep Selected & Delete Others
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
