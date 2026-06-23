/**
 * @file
 * Tool for resolving duplicate images in the library.
 * Allows comparing identical images side-by-side and selecting which to keep based on resolution/size.
 */
import { useState, useEffect } from 'react';
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
    Pagination
} from '@mantine/core';
import { 
    IconAlertCircle, 
    IconCheck, 
    IconTrash, 
    IconLayoutGrid,
    IconColumns,
    IconFolderOpen
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { 
    useReadDuplicateGroupsApiImagesDuplicatesGroupsGet,
    useResolveDuplicatesApiImagesDuplicatesResolvePost,
    useRevealImageApiImagesImageIdRevealPost
} from '../../api/generated/images/images';
import type { DuplicateGroup, ImageWithContext } from '../../api/model';
import { API_BASE_URL } from '../../config';

const API_BASE = `${API_BASE_URL}/api`;

const BYTES_PER_KB = 1024;
const THRESHOLD_MB = 1000;

export function DuplicateManager() {
    const { 
        data: groups, 
        isLoading, 
        isError, 
        refetch 
    } = useReadDuplicateGroupsApiImagesDuplicatesGroupsGet({});
    
    const resolveMutation = useResolveDuplicatesApiImagesDuplicatesResolvePost();

    const [resolving, setResolving] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'columns'>('grid');
    const [page, setPage] = useState(1);
    
    const ITEMS_PER_PAGE = 10;
    const totalPages = groups ? Math.ceil(groups.length / ITEMS_PER_PAGE) : 0;

    useEffect(() => {
        if (groups && page > totalPages && totalPages > 0) {
            setPage(totalPages);
        }
    }, [groups, page, totalPages]);

    const handleResolve = async (group: DuplicateGroup, keepId: number) => {
        const removeIds = group.images
            .map(img => img.id)
            .filter(id => id !== keepId);

        setResolving(group.phash);
        try {
            await resolveMutation.mutateAsync({
                data: {
                    keep_image_id: keepId,
                    remove_image_ids: removeIds
                }
            });
            notifications.show({
                title: 'Success',
                message: `Resolved duplicate group. Removed ${removeIds.length} redundant images.`,
                color: 'green',
                icon: <IconCheck size={16} />
            });
            refetch();
        } catch {
            notifications.show({
                title: 'Error',
                message: 'Failed to resolve duplicates.',
                color: 'red',
                icon: <IconAlertCircle size={16} />
            });
        } finally {
            setResolving(null);
        }
    };

    if (isLoading) {
        return (
            <Stack align="center" py="xl">
                <Loader size="xl" />
                <Text c="dimmed">Scanning for visually identical images...</Text>
            </Stack>
        );
    }

    if (isError) {
        return (
            <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
                Failed to load duplicate groups. Please ensure the backend is running.
            </Alert>
        );
    }

    if (!groups || groups.length === 0) {
        return (
            <Paper withBorder p="xl" radius="md" style={{ textAlign: 'center' }}>
                <Stack gap="sm">
                    <IconCheck size={48} color="var(--mantine-color-green-filled)" style={{ margin: '0 auto' }} />
                    <Title order={3}>No duplicates found!</Title>
                    <Text c="dimmed">Your library is clean and visually unique.</Text>
                    <Button variant="light" onClick={() => refetch()} mt="md">Refresh</Button>
                </Stack>
            </Paper>
        );
    }

    const paginatedGroups = groups?.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE) || [];

    return (
        <Stack gap="xl">
            <Group justify="space-between">
                <div>
                    <Title order={2}>Duplicate Resolution</Title>
                    <Text c="dimmed" size="sm">
                        Found {groups.length} groups of identical images. We recommend keeping the version with the highest resolution.
                    </Text>
                </div>
                <Group>
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

            <Stack gap="lg">
                {paginatedGroups.map((group) => (
                    <DuplicateGroupCard 
                        key={group.phash} 
                        group={group} 
                        onResolve={handleResolve}
                        isResolving={resolving === group.phash}
                        viewMode={viewMode}
                    />
                ))}
            </Stack>

            {totalPages > 1 && (
                <Group justify="center" mt="md">
                    <Pagination total={totalPages} value={page} onChange={setPage} />
                </Group>
            )}
        </Stack>
    );
}

interface GroupCardProps {
    group: DuplicateGroup;
    onResolve: (group: DuplicateGroup, keepId: number) => void;
    isResolving: boolean;
    viewMode: 'grid' | 'columns';
}

function DuplicateGroupCard({ group, onResolve, isResolving, viewMode }: GroupCardProps) {
    const [selectedKeepId, setSelectedKeepId] = useState<number>(group.recommended_keep_id);

    return (
        <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
            <Group p="md" justify="space-between" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))">
                <Group gap="sm">
                    <Badge color="blue" variant="filled">Hash: {group.phash.substring(0, 8)}</Badge>
                    <Text fw={500} size="sm">{group.images.length} Versions Found</Text>
                </Group>
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
    const revealMutation = useRevealImageApiImagesImageIdRevealPost();

    const handleReveal = (e: React.MouseEvent) => {
        e.stopPropagation();
        revealMutation.mutate({ imageId: image.id }, {
            onSuccess: () => {
                notifications.show({
                    title: 'Success',
                    message: 'Opened folder in explorer',
                    color: 'green',
                    icon: <IconFolderOpen size={16} />
                });
            },
            onError: () => {
                notifications.show({
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
                        <Text size="xs" c="dimmed" truncate="end">{image.creator_names.join(' & ')}</Text>
                    </Tooltip>
                    <Tooltip label={image.set_title} position="top" openDelay={300}>
                        <Text size="xs" c="dimmed" fw={500} truncate="end">{image.set_title}</Text>
                    </Tooltip>
                </Stack>

                <Divider variant="dashed" />

                <Group justify="space-between">
                    <Text size="xs" fw={700}>{image.width} × {image.height}</Text>
                    <Text size="xs" c="dimmed">{(image.file_size || 0) / BYTES_PER_KB > THRESHOLD_MB 
                        ? `${((image.file_size || 0) / BYTES_PER_KB / BYTES_PER_KB).toFixed(1)} MB` 
                        : `${((image.file_size || 0) / BYTES_PER_KB).toFixed(0)} KB`}</Text>
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
