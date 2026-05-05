import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Title, Text, Container, SimpleGrid, Group, Badge, Loader, 
    Center, Alert, Stack, ActionIcon, Menu, Button
} from '@mantine/core';
import { 
    IconAlertCircle, IconArrowLeft, IconDotsVertical, IconTrash, 
    IconExternalLink, IconFolder
} from '@tabler/icons-react';
import { useReadSetApiSetsSetIdGet, useDeleteSetApiSetsSetIdDelete } from '../../api/generated/sets/sets';
import { notifications } from '@mantine/notifications';
import { ImageGridItem } from './components/ImageGridItem';
import { Lightbox } from './components/Lightbox';

export default function SetDetail() {
    const { setId } = useParams<{ setId: string }>();
    const navigate = useNavigate();
    const { data: set, isLoading, error } = useReadSetApiSetsSetIdGet(Number(setId));
    const deleteMutation = useDeleteSetApiSetsSetIdDelete();

    // Lightbox State
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

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
                </Stack>

                <Group>
                    <Button 
                        leftSection={<IconFolder size={18} />} 
                        variant="light"
                        onClick={handleOpenFolder}
                    >
                        Open Folder
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

            {/* Image Gallery */}
            <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
                {set.images?.map((img, index) => (
                    <ImageGridItem 
                        key={img.id} 
                        image={img} 
                        onClick={() => setSelectedImageIndex(index)} 
                    />
                ))}
            </SimpleGrid>

            {/* Lightbox Modal */}
            <Lightbox 
                images={set.images || []}
                selectedIndex={selectedImageIndex}
                onClose={() => setSelectedImageIndex(null)}
                onSelectIndex={setSelectedImageIndex}
            />

            <style dangerouslySetInnerHTML={{ __html: `
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
