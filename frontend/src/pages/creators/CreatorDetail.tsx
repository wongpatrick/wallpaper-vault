import { useParams, useNavigate } from 'react-router-dom';
import { 
    Title, Text, Container, SimpleGrid, Group, Badge, Loader, 
    Center, Alert, Stack, ActionIcon, Menu, Button, Card, 
    TextInput, Select, Textarea, Modal
} from '@mantine/core';
import { 
    IconAlertCircle, IconArrowLeft, IconDotsVertical, IconTrash, 
    IconEdit, IconUser
} from '@tabler/icons-react';
import { 
    useReadCreatorApiCreatorsCreatorIdGet, 
    useUpdateCreatorApiCreatorsCreatorIdPatch,
    useDeleteCreatorApiCreatorsCreatorIdDelete
} from '../../api/generated/creators/creators';
import { notifications } from '@mantine/notifications';
import { SetCard } from '../sets/components/SetCard';
import type { Set, CreatorWithSets } from '../../api/model';
import { useState, useEffect } from 'react';

export default function CreatorDetail() {
    const { creatorId } = useParams<{ creatorId: string }>();
    const navigate = useNavigate();
    const { data: creatorData, isLoading, error, refetch } = useReadCreatorApiCreatorsCreatorIdGet(Number(creatorId));
    const creator = creatorData as CreatorWithSets | undefined;
    
    const updateMutation = useUpdateCreatorApiCreatorsCreatorIdPatch();
    const deleteMutation = useDeleteCreatorApiCreatorsCreatorIdDelete();

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editForm, setEditForm] = useState({
        canonical_name: '',
        type: '',
        notes: ''
    });

    useEffect(() => {
        if (creator) {
            setEditForm({
                canonical_name: creator.canonical_name,
                type: creator.type || 'Artist',
                notes: creator.notes || ''
            });
        }
    }, [creator]);

    if (isLoading) return <Center h={400}><Loader size="xl" /></Center>;

    if (error || !creator) {
        return (
            <Container size="xl">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red">
                    Could not fetch creator details.
                </Alert>
                <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/creators')} mt="md">
                    Back to Creators
                </Button>
            </Container>
        );
    }

    const handleUpdate = async () => {
        try {
            await updateMutation.mutateAsync({ 
                creatorId: Number(creatorId), 
                data: editForm 
            });
            notifications.show({ title: 'Success', message: 'Creator updated', color: 'green' });
            setIsEditModalOpen(false);
            refetch();
        } catch {
            notifications.show({ title: 'Error', message: 'Could not update creator', color: 'red' });
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure? This will NOT delete their wallpapers, but they will be marked as "Unknown Creator".')) return;
        try {
            await deleteMutation.mutateAsync({ creatorId: Number(creatorId) });
            notifications.show({ title: 'Creator deleted', message: 'Artist removed from database', color: 'blue' });
            navigate('/creators');
        } catch {
            notifications.show({ title: 'Error', message: 'Could not delete creator', color: 'red' });
        }
    };

    return (
        <Container size="xl" pb="xl">
            <Button 
                variant="subtle" 
                leftSection={<IconArrowLeft size={16} />} 
                onClick={() => navigate('/creators')} 
                mb="lg"
                color="gray"
            >
                Back to Artists
            </Button>

            {/* Profile Header */}
            <Card withBorder radius="md" p="xl" mb="xl">
                <Group justify="space-between" align="flex-start">
                    <Group align="center" gap="xl">
                        <Center 
                            w={80} h={80} 
                            bg="blue.1" 
                            style={{ borderRadius: '50%' }}
                        >
                            <IconUser size={40} color="var(--mantine-color-blue-6)" />
                        </Center>
                        <Stack gap={4}>
                            <Title order={1}>{creator.canonical_name}</Title>
                            <Group gap="xs">
                                <Badge size="lg" variant="light" color="blue">{creator.type || 'Artist'}</Badge>
                                <Badge size="lg" variant="outline" color="gray">{creator.sets?.length || 0} Sets</Badge>
                            </Group>
                        </Stack>
                    </Group>

                    <Group>
                        <Button leftSection={<IconEdit size={18} />} variant="light" onClick={() => setIsEditModalOpen(true)}>
                            Edit Profile
                        </Button>
                        <Menu shadow="md" width={200} position="bottom-end">
                            <Menu.Target>
                                <ActionIcon variant="outline" size="lg" radius="md">
                                    <IconDotsVertical size={18} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Label>Management</Menu.Label>
                                <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={handleDelete}>
                                    Delete Artist
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Group>

                {creator.notes && (
                        <Text mt="xl" size="lg" c="dimmed" fs="italic">
                            "{creator.notes}"
                        </Text>
                    )}
                </Card>

                {/* Artist's Sets */}
                <Title order={2} mb="lg">Collection by {creator.canonical_name}</Title>
                
                {creator.sets && creator.sets.length > 0 ? (
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
                        {creator.sets.map((set: Set) => (
                            <SetCard key={set.id} set={set} onDelete={() => {}} />
                        ))}
                    </SimpleGrid>
                ) : (
                    <Center py={100}>
                        <Text c="dimmed">This artist has no wallpaper sets yet.</Text>
                    </Center>
                )}

                {/* Edit Modal */}
                <Modal 
                    opened={isEditModalOpen} 
                    onClose={() => setIsEditModalOpen(false)} 
                    title="Edit Creator Profile"
                    radius="md"
                >
                    <Stack gap="md">
                        <TextInput 
                            label="Artist Name" 
                            value={editForm.canonical_name} 
                            onChange={(e) => setEditForm({ ...editForm, canonical_name: e.currentTarget.value })}
                        />
                        <Select 
                            label="Creator Type"
                            data={['Artist', 'AI Generated', 'Studio', 'Photography', 'Unknown']}
                            value={editForm.type}
                            onChange={(v) => setEditForm({ ...editForm, type: v || '' })}
                        />
                        <Textarea 
                            label="Internal Notes"
                            placeholder="Add links or artist info..."
                            value={editForm.notes}
                            onChange={(e) => setEditForm({ ...editForm, notes: e.currentTarget.value })}
                            minRows={3}
                        />
                        <Button fullWidth onClick={handleUpdate} mt="md">Save Changes</Button>
                    </Stack>
                </Modal>
        </Container>
    );
}
