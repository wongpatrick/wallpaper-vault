import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Title, Text, Container, Group, Badge, Loader, 
    Center, Alert, Stack, ActionIcon, Menu, Button, Modal,
    TextInput, Textarea, MultiSelect, TagsInput, Box
} from '@mantine/core';
import { 
    IconAlertCircle, IconArrowLeft, IconDotsVertical, IconTrash, 
    IconExternalLink, IconFolder, IconEdit, IconTag
} from '@tabler/icons-react';
import { 
    useReadSetApiSetsSetIdGet, 
    useDeleteSetApiSetsSetIdDelete,
    useUpdateSetApiSetsSetIdPatch 
} from '../../api/generated/sets/sets';
import { useReadCreatorsApiCreatorsGet } from '../../api/generated/creators/creators';
import { notifications } from '@mantine/notifications';
import { ImageGridItem } from './components/ImageGridItem';
import { Lightbox } from './components/Lightbox';
import { ImageEditModal } from './components/ImageEditModal';
import type { Image as ImageModel } from '../../api/model';

export default function SetDetail() {
    const { setId } = useParams<{ setId: string }>();
    const navigate = useNavigate();
    
    // 1. All hooks at the top
    const { data: set, isLoading, error, refetch } = useReadSetApiSetsSetIdGet(Number(setId));
    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 });
    const deleteMutation = useDeleteSetApiSetsSetIdDelete();
    const updateMutation = useUpdateSetApiSetsSetIdPatch();

    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingImage, setEditingImage] = useState<ImageModel | null>(null);
    
    const [editForm, setEditForm] = useState({
        title: '',
        notes: '',
        source_url: '',
        creator_ids: [] as string[],
        tags: [] as string[]
    });

    useEffect(() => {
        if (set) {
            setEditForm({
                title: set.title || '',
                notes: set.notes || '',
                source_url: set.source_url || '',
                creator_ids: set.creators?.map(c => String(c.id)) || [],
                tags: set.tags ? set.tags.split(',').filter(t => t.trim()) : []
            });
        }
    }, [set]);

    const creatorOptions = useMemo(() => 
        creatorsData?.items?.map(c => ({ value: String(c.id), label: c.canonical_name })) || [], 
    [creatorsData]);

    // 2. Early returns
    if (isLoading) {
        return <Center h={400}><Loader size="xl" /></Center>;
    }

    if (error || !set) {
        return (
            <Container size="xl">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red">
                    Could not fetch the set details.
                </Alert>
                <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/sets')} mt="md">
                    Back to Sets
                </Button>
            </Container>
        );
    }

    // 3. Handlers
    const handleUpdate = async () => {
        try {
            await updateMutation.mutateAsync({
                setId: Number(setId),
                data: {
                    ...editForm,
                    creator_ids: editForm.creator_ids.map(Number),
                    tags: editForm.tags.join(',')
                }
            });
            notifications.show({ title: 'Success', message: 'Set metadata updated', color: 'green' });
            setIsEditModalOpen(false);
            refetch();
        } catch {
            notifications.show({ title: 'Error', message: 'Could not update set', color: 'red' });
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this set? This cannot be undone.')) return;
        try {
            await deleteMutation.mutateAsync({ setId: Number(setId) });
            notifications.show({ title: 'Set deleted', message: 'Set removed from vault', color: 'blue' });
            navigate('/sets');
        } catch {
            notifications.show({ title: 'Error', message: 'Could not delete set', color: 'red' });
        }
    };

    const handleOpenFolder = async () => {
        if (!set?.local_path) {
            notifications.show({ title: 'Error', message: 'No local path recorded.', color: 'red' });
            return;
        }
        try {
            const result = await (window.electron as any).openPath(set.local_path);
            if (result && result.error) {
                notifications.show({ title: 'Folder not found', message: result.error, color: 'red' });
            }
        } catch {
            notifications.show({ title: 'Native Error', message: 'Could not open folder.', color: 'red' });
        }
    };

    const creatorNames = set.creators?.map(c => c.canonical_name).join(' & ') || 'Unknown Creator';

    return (
        <Container size="xl" pb="xl">
            {/* Header Navigation */}
            <Button 
                variant="subtle" 
                leftSection={<IconArrowLeft size={16} />} 
                onClick={() => navigate('/sets')} 
                mb="lg"
                color="gray"
            >
                Back to Library
            </Button>

            {/* Hero Section */}
            <Group justify="space-between" align="flex-start" mb="xl">
                <Stack gap={4}>
                    <Title order={1}>{set.title || 'Untitled Set'}</Title>
                    <Group gap="xs">
                        <Text size="lg" c="dimmed">{creatorNames}</Text>
                        <Text c="dimmed" size="lg">•</Text>
                        <Badge size="lg" variant="dot">{set.images?.length || 0} Images</Badge>
                        <Badge size="lg" variant="outline" color="gray">{set.date_added}</Badge>
                    </Group>
                    {set.notes && (
                        <Text mt="md" fs="italic" c="dimmed" style={{ maxWidth: 800 }}>"{set.notes}"</Text>
                    )}
                    
                    {/* Metadata Badges */}
                    {set.tags && (
                        <Group gap="xs" mt="sm">
                            {set.tags.split(',').filter(t => t.trim()).map(tag => (
                                <Badge key={tag} variant="light" color="gray" leftSection={<IconTag size={12} />}>
                                    {tag}
                                </Badge>
                            ))}
                        </Group>
                    )}
                </Stack>

                <Group>
                    <Button 
                        leftSection={<IconFolder size={18} />} 
                        variant="light"
                        onClick={handleOpenFolder}
                    >
                        Open Folder
                    </Button>
                    <Button 
                        leftSection={<IconEdit size={18} />} 
                        variant="outline"
                        onClick={() => setIsEditModalOpen(true)}
                    >
                        Edit Metadata
                    </Button>
                    <Menu shadow="md" width={200} position="bottom-end">
                        <Menu.Target>
                            <ActionIcon variant="outline" size="lg" radius="md">
                                <IconDotsVertical size={18} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>Management</Menu.Label>
                            {set.source_url && (
                                <Menu.Item 
                                    component="a" 
                                    href={set.source_url} 
                                    target="_blank" 
                                    leftSection={<IconExternalLink size={14} />}
                                >
                                    Source URL
                                </Menu.Item>
                            )}
                            <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={handleDelete}>
                                Delete Set
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </Group>

            {/* Image Gallery (Masonry Layout) */}
            <Box style={{ 
                columnCount: 4, 
                columnGap: '16px',
            }} className="masonry-grid">
                {set.images?.map((img, index) => (
                    <ImageGridItem 
                        key={img.id} 
                        image={img} 
                        onClick={() => setSelectedImageIndex(index)} 
                    />
                ))}
            </Box>

            {/* Lightbox Modal */}
            <Lightbox 
                images={set.images || []}
                selectedIndex={selectedImageIndex}
                onClose={() => setSelectedImageIndex(null)}
                onSelectIndex={setSelectedImageIndex}
                onEdit={(img) => setEditingImage(img)}
            />

            {/* Set Edit Modal */}
            <Modal 
                opened={isEditModalOpen} 
                onClose={() => setIsEditModalOpen(false)} 
                title="Edit Set Metadata"
                size="lg"
                radius="md"
            >
                <Stack gap="md">
                    <TextInput 
                        label="Set Title" 
                        value={editForm.title} 
                        onChange={(e) => setEditForm({ ...editForm, title: e.currentTarget.value })}
                    />
                    <MultiSelect
                        label="Artists / Creators"
                        placeholder="Pick artists"
                        data={creatorOptions}
                        value={editForm.creator_ids}
                        onChange={(ids) => setEditForm({ ...editForm, creator_ids: ids })}
                        searchable
                        clearable
                    />
                    <TagsInput 
                        label="Tags"
                        placeholder="Add tags..."
                        value={editForm.tags}
                        onChange={(tags) => setEditForm({ ...editForm, tags })}
                    />
                    <TextInput 
                        label="Source URL" 
                        value={editForm.source_url} 
                        onChange={(e) => setEditForm({ ...editForm, source_url: e.currentTarget.value })}
                    />
                    <Textarea 
                        label="Notes"
                        placeholder="Personal notes about this set..."
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.currentTarget.value })}
                        minRows={3}
                    />
                    <Button fullWidth onClick={handleUpdate} mt="md">Save Changes</Button>
                </Stack>
            </Modal>

            {/* Image Edit Modal */}
            <ImageEditModal 
                image={editingImage}
                opened={!!editingImage}
                onClose={() => setEditingImage(null)}
                onUpdated={() => refetch()}
            />

            <style dangerouslySetInnerHTML={{ __html: `
                @media (max-width: 1200px) { .masonry-grid { column-count: 3 !important; } }
                @media (max-width: 900px) { .masonry-grid { column-count: 2 !important; } }
                @media (max-width: 600px) { .masonry-grid { column-count: 1 !important; } }

                .image-card:hover .image-overlay {
                    opacity: 1 !important;
                }
                .image-card img {
                    transition: transform 0.3s ease;
                }
                .image-card:hover img {
                    transform: scale(1.05);
                }
            `}} />
        </Container>
    );
}
