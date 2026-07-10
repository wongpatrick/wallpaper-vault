/**
 * @file
 * Module: Playlists Directory Page
 * Description: Lists all custom collections/playlists and provides CRUD operations for them.
 */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Container, Title, Text, Stack, Group, Button, SimpleGrid, Card, Badge, ActionIcon, Modal, TextInput, Textarea, Center, Loader, Alert,
    SegmentedControl, MultiSelect, Select
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import {
    IconAlertCircle, IconPlus, IconTrash, IconEdit, IconListDetails, IconPlaylist
} from '@tabler/icons-react';
import {
    useReadPlaylistsApiPlaylistsGet,
    useCreatePlaylistEndpointApiPlaylistsPost,
    useUpdatePlaylistEndpointApiPlaylistsPlaylistIdPut,
    useDeletePlaylistEndpointApiPlaylistsPlaylistIdDelete
} from '../../api/generated/playlists/playlists';
import { useReadCreatorsApiCreatorsGet } from '../../api/generated/creators/creators';
import { TagAutocompleteInput } from '../../components/ui/TagAutocompleteInput';
import type { Playlist, SmartPlaylistRules } from '../../api/model';

const COLUMNS_RESPONSIVE = { base: 1, sm: 2, md: 3, lg: 4 };

export default function Playlists() {
    const navigate = useNavigate();
    const location = useLocation();
    const { data: playlists = [], isLoading, error, refetch } = useReadPlaylistsApiPlaylistsGet();
    const createMutation = useCreatePlaylistEndpointApiPlaylistsPost();
    const updateMutation = useUpdatePlaylistEndpointApiPlaylistsPlaylistIdPut();
    const deleteMutation = useDeletePlaylistEndpointApiPlaylistsPlaylistIdDelete();

    // Fetch creators for the creator selector
    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 });
    const creatorOptions = (creatorsData?.items || []).map(c => ({
        value: String(c.id),
        label: c.canonical_name
    }));

    // Modal state for Create / Edit
    const [modalOpened, setModalOpened] = useState(false);
    const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
    const [formName, setFormName] = useState('');
    const [formDesc, setFormDesc] = useState('');

    // Smart playlist state variables
    const [isSmart, setIsSmart] = useState(false);
    const [includedTags, setIncludedTags] = useState<string[]>([]);
    const [excludedTags, setExcludedTags] = useState<string[]>([]);
    const [ratings, setRatings] = useState<string[]>(['safe']);
    const [isFavorite, setIsFavorite] = useState<string>('ignore');
    const [minWidth, setMinWidth] = useState<string>('');
    const [minHeight, setMinHeight] = useState<string>('');
    const [creatorId, setCreatorId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<string>('date_added');
    const [sortDir, setSortDir] = useState<string>('desc');

    const openCreateModal = () => {
        setEditingPlaylist(null);
        setFormName('');
        setFormDesc('');
        setIsSmart(false);
        setIncludedTags([]);
        setExcludedTags([]);
        setRatings(['safe']);
        setIsFavorite('ignore');
        setMinWidth('');
        setMinHeight('');
        setCreatorId(null);
        setSortBy('date_added');
        setSortDir('desc');
        setModalOpened(true);
    };

    const openEditModal = (playlist: Playlist) => {
        setEditingPlaylist(playlist);
        setFormName(playlist.name);
        setFormDesc(playlist.description || '');
        setIsSmart(playlist.is_smart || false);
        const rules = playlist.rules;
        if (rules) {
            setIncludedTags(rules.included_tags || []);
            setExcludedTags(rules.excluded_tags || []);
            setRatings(rules.ratings || []);
            setIsFavorite(
                rules.is_favorite === true
                    ? 'favorites'
                    : rules.is_favorite === false
                    ? 'non-favorites'
                    : 'ignore'
            );
            setMinWidth(rules.min_width ? String(rules.min_width) : '');
            setMinHeight(rules.min_height ? String(rules.min_height) : '');
            setCreatorId(rules.creator_id ? String(rules.creator_id) : null);
            setSortBy(rules.sort_by || 'date_added');
            setSortDir(rules.sort_dir || 'desc');
        } else {
            setIncludedTags([]);
            setExcludedTags([]);
            setRatings(['safe']);
            setIsFavorite('ignore');
            setMinWidth('');
            setMinHeight('');
            setCreatorId(null);
            setSortBy('date_added');
            setSortDir('desc');
        }
        setModalOpened(true);
    };

    const handleSave = async () => {
        if (!formName.trim()) {
            notifications.show({
                title: 'Required Field',
                message: 'Playlist name cannot be empty.',
                color: 'red'
            });
            return;
        }

        const rulesPayload: SmartPlaylistRules | null = isSmart ? {
            included_tags: includedTags,
            excluded_tags: excludedTags,
            ratings: ratings,
            is_favorite: isFavorite === 'favorites' ? true : isFavorite === 'non-favorites' ? false : undefined,
            min_width: minWidth ? parseInt(minWidth) : undefined,
            min_height: minHeight ? parseInt(minHeight) : undefined,
            creator_id: creatorId ? parseInt(creatorId) : undefined,
            sort_by: sortBy as SmartPlaylistRules['sort_by'],
            sort_dir: sortDir as SmartPlaylistRules['sort_dir']
        } : null;

        try {
            if (editingPlaylist) {
                // Update
                await updateMutation.mutateAsync({
                    playlistId: editingPlaylist.id,
                    data: {
                        name: formName,
                        description: formDesc,
                        rules: rulesPayload
                    }
                });
                notifications.show({
                    title: 'Success',
                    message: 'Playlist updated successfully.',
                    color: 'green'
                });
            } else {
                // Create
                await createMutation.mutateAsync({
                    data: {
                        name: formName,
                        description: formDesc,
                        is_smart: isSmart,
                        rules: rulesPayload
                    }
                });
                notifications.show({
                    title: 'Success',
                    message: 'Playlist created successfully.',
                    color: 'green'
                });
            }
            setModalOpened(false);
            refetch();
        } catch (err: unknown) {
            const errorResponse = err as { response?: { data?: { detail?: string } } };
            const detail = errorResponse.response?.data?.detail || 'Could not save playlist.';
            notifications.show({
                title: 'Error',
                message: detail,
                color: 'red'
            });
        }
    };

    const confirmDelete = (playlist: Playlist) => {
        modals.openConfirmModal({
            title: 'Delete Playlist',
            children: (
                <Text size="sm">
                    Are you sure you want to delete the playlist <strong>{playlist.name}</strong>?
                    This will not delete the wallpapers themselves, only the collection.
                </Text>
            ),
            labels: { confirm: 'Delete', cancel: 'Cancel' },
            confirmProps: { color: 'red' },
            onConfirm: async () => {
                try {
                    await deleteMutation.mutateAsync({ playlistId: playlist.id });
                    notifications.show({
                        title: 'Deleted',
                        message: 'Playlist deleted successfully.',
                        color: 'blue'
                    });
                    refetch();
                } catch {
                    notifications.show({
                        title: 'Error',
                        message: 'Could not delete playlist.',
                        color: 'red'
                    });
                }
            }
        });
    };

    return (
        <Container fluid px="xl">
            <Group justify="space-between" align="center" mb="xl">
                <Stack gap={4}>
                    <Title order={1} fw={800} style={{ letterSpacing: '-1px' }}>
                        🎵 Collections & Playlists
                    </Title>
                    <Text c="dimmed" size="lg">
                        Group wallpapers across sets and fetch them for rotation.
                    </Text>
                </Stack>
                <Button
                    leftSection={<IconPlus size={16} />}
                    onClick={openCreateModal}
                    radius="md"
                    size="md"
                >
                    Create Playlist
                </Button>
            </Group>

            {isLoading ? (
                <Center h={200}>
                    <Loader size="xl" />
                </Center>
            ) : error ? (
                <Alert icon={<IconAlertCircle size="1.2rem" />} title="Error!" color="red">
                    Could not fetch playlists from the backend.
                </Alert>
            ) : playlists.length === 0 ? (
                <Center style={{ minHeight: '40vh', flexDirection: 'column' }}>
                    <IconPlaylist size={64} style={{ opacity: 0.2 }} />
                    <Text size="xl" fw={600} c="dimmed" mt="md">
                        No playlists found
                    </Text>
                    <Text c="dimmed" size="sm" mt={4} mb="xl">
                        Create your first custom collection to get started.
                    </Text>
                    <Button variant="light" leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
                        Create Playlist
                    </Button>
                </Center>
            ) : (
                <SimpleGrid cols={COLUMNS_RESPONSIVE} spacing="lg">
                    {playlists.map((playlist) => (
                        <Card
                            key={playlist.id}
                            shadow="sm"
                            padding="lg"
                            radius="md"
                            withBorder
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%',
                                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                cursor: 'pointer'
                            }}
                            onClick={() => navigate(`/playlists/${playlist.id}`, { state: { from: location.pathname, fromLabel: 'Playlists' } })}
                            className="playlist-card"
                        >
                            <Stack justify="space-between" style={{ flex: 1 }} gap="md">
                                <Stack gap="xs">
                                    <Group justify="space-between" wrap="nowrap">
                                        <Text fw={700} size="lg" truncate="end">
                                            {playlist.name}
                                        </Text>
                                        <Badge variant="light" color="violet" size="md">
                                            {playlist.image_count} {playlist.image_count === 1 ? 'wallpaper' : 'wallpapers'}
                                        </Badge>
                                    </Group>

                                    <Text size="sm" c="dimmed" lineClamp={2} style={{ minHeight: '2.8rem' }}>
                                        {playlist.description || 'No description provided.'}
                                    </Text>
                                </Stack>

                                <Group justify="space-between" mt="md">
                                    <Text size="xs" c="dimmed">
                                        Created: {playlist.date_created}
                                    </Text>
                                    <Group gap="xs" onClick={(e) => e.stopPropagation()}>
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            radius="md"
                                            onClick={() => openEditModal(playlist)}
                                            aria-label="Edit playlist metadata"
                                        >
                                            <IconEdit size={16} />
                                        </ActionIcon>
                                        <ActionIcon
                                            variant="subtle"
                                            color="red"
                                            radius="md"
                                            onClick={() => confirmDelete(playlist)}
                                            aria-label="Delete playlist"
                                        >
                                            <IconTrash size={16} />
                                        </ActionIcon>
                                        <ActionIcon
                                            variant="light"
                                            color="blue"
                                            radius="md"
                                            onClick={() => navigate(`/playlists/${playlist.id}`, { state: { from: location.pathname, fromLabel: 'Playlists' } })}
                                            aria-label="View playlist details"
                                        >
                                            <IconListDetails size={16} />
                                        </ActionIcon>
                                    </Group>
                                </Group>
                            </Stack>
                        </Card>
                    ))}
                </SimpleGrid>
            )}

            {/* Create/Edit Modal */}
            <Modal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                title={editingPlaylist ? 'Edit Playlist' : 'Create Playlist'}
                radius="md"
                size="md"
            >
                <Stack gap="md">
                    <TextInput
                        label="Playlist Name"
                        placeholder="e.g. Dual Monitor spans, Dark mood"
                        value={formName}
                        onChange={(e) => setFormName(e.currentTarget.value)}
                        required
                        data-autofocus
                    />
                    <Textarea
                        label="Description"
                        placeholder="Describe the content or purpose of this playlist..."
                        value={formDesc}
                        onChange={(e) => setFormDesc(e.currentTarget.value)}
                        minRows={3}
                    />

                    {!editingPlaylist && (
                        <SegmentedControl
                            value={isSmart ? 'smart' : 'static'}
                            onChange={(val) => setIsSmart(val === 'smart')}
                            data={[
                                { label: 'Static Playlist', value: 'static' },
                                { label: 'Smart (Dynamic) Playlist', value: 'smart' }
                            ]}
                            mb="xs"
                        />
                    )}

                    {isSmart && (
                        <Stack gap="sm">
                            <TagAutocompleteInput
                                label="Included Tags"
                                placeholder="Add tags to include (matches at least one)"
                                value={includedTags}
                                onChange={setIncludedTags}
                            />
                            <TagAutocompleteInput
                                label="Excluded Tags"
                                placeholder="Add tags to exclude"
                                value={excludedTags}
                                onChange={setExcludedTags}
                            />
                            <MultiSelect
                                label="Allowed Ratings"
                                placeholder="Select ratings"
                                data={[
                                    { label: 'Safe', value: 'safe' },
                                    { label: 'Questionable', value: 'questionable' },
                                    { label: 'Explicit', value: 'explicit' }
                                ]}
                                value={ratings}
                                onChange={setRatings}
                            />
                            <Select
                                label="Favorite Status"
                                value={isFavorite}
                                onChange={(val) => setIsFavorite(val || 'ignore')}
                                data={[
                                    { label: 'Ignore favorite status', value: 'ignore' },
                                    { label: 'Favorites only', value: 'favorites' },
                                    { label: 'Non-favorites only', value: 'non-favorites' }
                                ]}
                            />
                            <Group grow>
                                <TextInput
                                    label="Min Width (px)"
                                    placeholder="e.g. 1920"
                                    type="number"
                                    value={minWidth}
                                    onChange={(e) => setMinWidth(e.currentTarget.value)}
                                />
                                <TextInput
                                    label="Min Height (px)"
                                    placeholder="e.g. 1080"
                                    type="number"
                                    value={minHeight}
                                    onChange={(e) => setMinHeight(e.currentTarget.value)}
                                />
                            </Group>
                            <Select
                                label="Filter by Artist / Creator"
                                placeholder="Select artist"
                                value={creatorId}
                                onChange={setCreatorId}
                                data={creatorOptions}
                                clearable
                                searchable
                            />
                            <Group grow mb="sm">
                                <Select
                                    label="Sort By"
                                    value={sortBy}
                                    onChange={(val) => setSortBy(val || 'date_added')}
                                    data={[
                                        { label: 'Date Added', value: 'date_added' },
                                        { label: 'Filename', value: 'filename' },
                                        { label: 'Resolution', value: 'resolution' },
                                        { label: 'File Size', value: 'file_size' }
                                    ]}
                                />
                                <Select
                                    label="Sort Direction"
                                    value={sortDir}
                                    onChange={(val) => setSortDir(val || 'desc')}
                                    data={[
                                        { label: 'Descending (Newest/Largest)', value: 'desc' },
                                        { label: 'Ascending (Oldest/Smallest)', value: 'asc' }
                                    ]}
                                />
                            </Group>
                        </Stack>
                    )}

                    <Button onClick={handleSave} mt="md" loading={createMutation.isPending || updateMutation.isPending}>
                        Save
                    </Button>
                </Stack>
            </Modal>

            <style dangerouslySetInnerHTML={{ __html: `
                .playlist-card:hover {
                    transform: translateY(-4px);
                    box-shadow: var(--mantine-shadow-md);
                }
            `}} />
        </Container>
    );
}
