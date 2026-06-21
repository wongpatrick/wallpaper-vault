/**
 * @file
 * Module: Add to Playlist Modal
 * Description: Reusable modal to add a list of image IDs to one or more playlists, with inline playlist creation.
 */
import { useState, useEffect } from 'react';
import { Modal, Stack, Button, Checkbox, TextInput, Text, Group, ScrollArea, Divider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import {
    useReadPlaylistsApiPlaylistsGet,
    useCreatePlaylistEndpointApiPlaylistsPost,
    useAddImagesApiPlaylistsPlaylistIdImagesPost
} from '../../api/generated/playlists/playlists';

interface AddToPlaylistModalProps {
    opened: boolean;
    onClose: () => void;
    imageIds: number[];
    onSuccess?: () => void;
}

export function AddToPlaylistModal({ opened, onClose, imageIds, onSuccess }: AddToPlaylistModalProps) {
    const { data: playlists = [], refetch } = useReadPlaylistsApiPlaylistsGet();
    const createPlaylistMutation = useCreatePlaylistEndpointApiPlaylistsPost();
    const addImagesMutation = useAddImagesApiPlaylistsPlaylistIdImagesPost();

    const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<number[]>([]);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [loading, setLoading] = useState(false);

    // Reset selection when opened
    useEffect(() => {
        if (opened) {
            setSelectedPlaylistIds([]);
            setNewPlaylistName('');
            setIsCreating(false);
            setLoading(false);
        }
    }, [opened]);

    const handleCreatePlaylist = async () => {
        if (!newPlaylistName.trim()) {
            notifications.show({
                title: 'Name required',
                message: 'Please enter a name for the new playlist.',
                color: 'red'
            });
            return;
        }

        try {
            setIsCreating(true);
            const newPlaylist = await createPlaylistMutation.mutateAsync({
                data: { name: newPlaylistName.trim() }
            });
            notifications.show({
                title: 'Playlist Created',
                message: `Playlist "${newPlaylist.name}" created successfully.`,
                color: 'green'
            });
            // Automatically select the new playlist
            setSelectedPlaylistIds(prev => [...prev, newPlaylist.id]);
            setNewPlaylistName('');
            refetch();
        } catch (err: unknown) {
            const errorResponse = err as { response?: { data?: { detail?: string } } };
            const detail = errorResponse.response?.data?.detail || 'Could not create playlist.';
            notifications.show({
                title: 'Error',
                message: detail,
                color: 'red'
            });
        } finally {
            setIsCreating(false);
        }
    };

    const handleTogglePlaylist = (id: number) => {
        setSelectedPlaylistIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleAdd = async () => {
        if (selectedPlaylistIds.length === 0) {
            notifications.show({
                title: 'No playlist selected',
                message: 'Please select or create at least one playlist.',
                color: 'red'
            });
            return;
        }

        setLoading(true);
        try {
            // Add images to all selected playlists
            await Promise.all(
                selectedPlaylistIds.map(playlistId =>
                    addImagesMutation.mutateAsync({
                        playlistId,
                        data: { image_ids: imageIds }
                    })
                )
            );

            notifications.show({
                title: 'Added successfully',
                message: `Added ${imageIds.length} ${imageIds.length === 1 ? 'wallpaper' : 'wallpapers'} to selected playlists.`,
                color: 'green'
            });

            onSuccess?.();
            onClose();
        } catch {
            notifications.show({
                title: 'Error',
                message: 'Could not add wallpapers to playlists.',
                color: 'red'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={`Add to Playlist (${imageIds.length} ${imageIds.length === 1 ? 'wallpaper' : 'wallpapers'} selected)`}
            radius="md"
            size="md"
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Select the playlists you want to add these wallpapers to:
                </Text>

                {playlists.length > 0 ? (
                    <ScrollArea.Autosize mah={220} type="auto">
                        <Stack gap="sm">
                            {playlists.map(p => (
                                <Group key={p.id} justify="space-between">
                                    <Checkbox
                                        label={p.name}
                                        checked={selectedPlaylistIds.includes(p.id)}
                                        onChange={() => handleTogglePlaylist(p.id)}
                                        styles={{ label: { cursor: 'pointer' } }}
                                    />
                                    <Text size="xs" c="dimmed">
                                        ({p.image_count} items)
                                    </Text>
                                </Group>
                            ))}
                        </Stack>
                    </ScrollArea.Autosize>
                ) : (
                    <Text size="sm" c="dimmed" fs="italic">
                        No playlists created yet. Create one below!
                    </Text>
                )}

                <Divider my="xs" />

                {/* Inline Playlist Creation */}
                <Stack gap="xs">
                    <Text size="xs" fw={700} c="dimmed">
                        Create New Playlist
                    </Text>
                    <Group gap="xs" style={{ flexWrap: 'nowrap' }}>
                        <TextInput
                            placeholder="New playlist name..."
                            value={newPlaylistName}
                            onChange={e => setNewPlaylistName(e.currentTarget.value)}
                            style={{ flex: 1 }}
                            radius="md"
                            disabled={loading}
                        />
                        <Button
                            variant="light"
                            onClick={handleCreatePlaylist}
                            loading={isCreating}
                            radius="md"
                            disabled={loading || !newPlaylistName.trim()}
                        >
                            <IconPlus size={16} />
                        </Button>
                    </Group>
                </Stack>

                <Group justify="flex-end" mt="lg">
                    <Button variant="subtle" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleAdd}
                        loading={loading}
                        disabled={selectedPlaylistIds.length === 0}
                        radius="md"
                    >
                        Confirm Add
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
