/**
 * @file
 * Module: Playlist Modal
 * Description: Reusable modal dialog for creating or editing static and smart playlists.
 */
import { useState } from 'react';
import {
    Modal, Stack, TextInput, Textarea, SegmentedControl, MultiSelect, Select, Group, Button, Switch, Alert
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {
    useCreatePlaylistEndpointApiPlaylistsPost,
    useUpdatePlaylistEndpointApiPlaylistsPlaylistIdPut
} from '../../api/generated/playlists/playlists';
import { useReadCreatorsApiCreatorsGet } from '../../api/generated/creators/creators';
import { useVault } from '../../hooks/useVault';
import { TagAutocompleteInput } from '../ui/TagAutocompleteInput';
import type { Playlist, PlaylistDetail, SmartPlaylistRules } from '../../api/model';

const CREATOR_LIMIT = 1000;
const TEXTAREA_MIN_ROWS = 3;
const RADIX_DECIMAL = 10;

interface PlaylistModalProps {
    opened: boolean;
    onClose: () => void;
    playlist?: (Playlist | PlaylistDetail) & { is_cross_vault?: boolean } | null;
    onSuccess?: () => void;
}

interface PlaylistModalFormProps {
    playlist?: (Playlist | PlaylistDetail) & { is_cross_vault?: boolean } | null;
    onClose: () => void;
    onSuccess?: () => void;
}

function PlaylistModalForm({ playlist, onClose, onSuccess }: PlaylistModalFormProps) {
    const { vaults } = useVault();
    const hasRemoteVaults = vaults.some(v => !v.isLocal);

    const createMutation = useCreatePlaylistEndpointApiPlaylistsPost();
    const updateMutation = useUpdatePlaylistEndpointApiPlaylistsPlaylistIdPut();

    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: CREATOR_LIMIT });
    const creatorOptions = (creatorsData?.items || []).map(c => ({
        value: String(c.id),
        label: c.canonical_name
    }));

    const rules = playlist?.rules;
    const [formName, setFormName] = useState(playlist?.name || '');
    const [formDesc, setFormDesc] = useState(playlist?.description || '');
    const [isCrossVault, setIsCrossVault] = useState(playlist?.is_cross_vault || false);
    const [isSmart, setIsSmart] = useState(playlist?.is_smart || false);
    const [includedTags, setIncludedTags] = useState<string[]>(rules?.included_tags || []);
    const [excludedTags, setExcludedTags] = useState<string[]>(rules?.excluded_tags || []);
    const [ratings, setRatings] = useState<string[]>(rules?.ratings || ['safe']);
    const [isFavorite, setIsFavorite] = useState<string>(
        rules?.is_favorite === true
            ? 'favorites'
            : rules?.is_favorite === false
            ? 'non-favorites'
            : 'ignore'
    );
    const [minWidth, setMinWidth] = useState<string>(rules?.min_width ? String(rules.min_width) : '');
    const [minHeight, setMinHeight] = useState<string>(rules?.min_height ? String(rules.min_height) : '');
    const [creatorId, setCreatorId] = useState<string | null>(rules?.creator_id ? String(rules.creator_id) : null);
    const [sortBy, setSortBy] = useState<string>(rules?.sort_by || 'date_added');
    const [sortDir, setSortDir] = useState<string>(rules?.sort_dir || 'desc');

    const handleSave = async () => {
        if (!formName.trim()) {
            notifications.show({
                title: 'Required Field',
                message: 'Playlist name cannot be empty.',
                color: 'red'
            });
            return;
        }

        const rulesPayload: SmartPlaylistRules | null = (!isCrossVault && isSmart) ? {
            included_tags: includedTags,
            excluded_tags: excludedTags,
            ratings: ratings as SmartPlaylistRules['ratings'],
            is_favorite: isFavorite === 'favorites' ? true : isFavorite === 'non-favorites' ? false : undefined,
            min_width: minWidth ? parseInt(minWidth, RADIX_DECIMAL) : undefined,
            min_height: minHeight ? parseInt(minHeight, RADIX_DECIMAL) : undefined,
            creator_id: creatorId ? parseInt(creatorId, RADIX_DECIMAL) : undefined,
            sort_by: sortBy as SmartPlaylistRules['sort_by'],
            sort_dir: sortDir as SmartPlaylistRules['sort_dir']
        } : null;

        try {
            if (playlist) {
                await updateMutation.mutateAsync({
                    playlistId: playlist.id,
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
                await createMutation.mutateAsync({
                    data: {
                        name: formName,
                        description: formDesc,
                        is_smart: !isCrossVault && isSmart,
                        is_cross_vault: isCrossVault,
                        rules: rulesPayload
                    }
                });
                notifications.show({
                    title: 'Success',
                    message: 'Playlist created successfully.',
                    color: 'green'
                });
            }
            onClose();
            onSuccess?.();
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

    return (
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
                minRows={TEXTAREA_MIN_ROWS}
            />

            {!playlist && hasRemoteVaults && (
                <Switch
                    label="Cross-Vault Playlist"
                    description="Span wallpapers across multiple connected vaults"
                    checked={isCrossVault}
                    onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setIsCrossVault(checked);
                        if (checked) {
                            setIsSmart(false);
                        }
                    }}
                />
            )}

            {isCrossVault && (
                <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                    Cross-vault playlists pull wallpapers from any connected vault. Wallpapers can be picked from specific vaults on the playlist detail page.
                </Alert>
            )}

            {!playlist && !isCrossVault && (
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

            {!isCrossVault && isSmart && (
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
    );
}

export function PlaylistModal({ opened, onClose, playlist, onSuccess }: PlaylistModalProps) {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={playlist ? 'Edit Playlist' : 'Create Playlist'}
            radius="md"
            size="md"
        >
            {opened && (
                <PlaylistModalForm
                    playlist={playlist}
                    onClose={onClose}
                    onSuccess={onSuccess}
                />
            )}
        </Modal>
    );
}
