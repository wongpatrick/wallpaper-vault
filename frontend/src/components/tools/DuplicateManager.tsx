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
    ScrollArea,
    rem
} from '@mantine/core';
import { 
    IconAlertCircle, 
    IconCheck, 
    IconTrash, 
    IconEye, 
    IconExternalLink,
    IconLayoutGrid,
    IconColumns
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { 
    useReadDuplicateGroupsApiImagesDuplicatesGroupsGet,
    useResolveDuplicatesApiImagesDuplicatesResolvePost 
} from '../../api/generated/images/images';
import type { DuplicateGroup, ImageWithContext } from '../../api/model';

const API_BASE = 'http://localhost:8000/api';

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
        } catch (error) {
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
                    <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
                </Group>
            </Group>

            <Stack gap="lg">
                {groups.map((group) => (
                    <DuplicateGroupCard 
                        key={group.phash} 
                        group={group} 
                        onResolve={handleResolve}
                        isResolving={resolving === group.phash}
                        viewMode={viewMode}
                    />
                ))}
            </Stack>
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
            <Group p="md" justify="space-between" bg="var(--mantine-color-gray-0)">
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
                        src={`${API_BASE}/images/file/${image.id}`} 
                        radius="sm" 
                        h={180} 
                        fallbackSrc="https://placehold.co/600x400?text=No+Image"
                        style={{ objectFit: 'cover' }}
                    />
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
                    <Text fw={700} size="sm" truncate="end">{image.filename}</Text>
                    <Text size="xs" c="dimmed" truncate="end">{image.creator_names.join(' & ')}</Text>
                    <Text size="xs" c="dimmed" fw={500}>{image.set_title}</Text>
                </Stack>

                <Divider variant="dashed" />

                <Group justify="space-between">
                    <Text size="xs" fw={700}>{image.width} × {image.height}</Text>
                    <Text size="xs" c="dimmed">{(image.file_size || 0) / 1024 > 1000 
                        ? `${((image.file_size || 0) / 1024 / 1024).toFixed(1)} MB` 
                        : `${((image.file_size || 0) / 1024).toFixed(0)} KB`}</Text>
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
