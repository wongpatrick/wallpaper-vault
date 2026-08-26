/**
 * @file
 * Cross-Vault Image Picker Modal.
 * Allows browsing wallpapers on a specific connected vault and adding them to a cross-vault playlist.
 */
import { useState, useEffect, useCallback } from 'react';
import {
    Modal,
    Stack,
    Select,
    SimpleGrid,
    Card,
    Image as MantineImage,
    Text,
    Group,
    Button,
    TextInput,
    Pagination,
    Loader,
    Center,
    Checkbox,
    Alert,
    Box,
} from '@mantine/core';
import { IconSearch, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useVault } from '../../hooks/useVault';
import { AXIOS_INSTANCE } from '../../api/axios-instance';
import type { Image as ImageModel } from '../../api/model';

const PAGE_SIZE = 24;
const BORDER_WIDTH_SELECTED = 2;
const BORDER_WIDTH_DEFAULT = 1;
const THUMBNAIL_HEIGHT = 120;
const MODAL_MIN_HEIGHT = 450;
const LOADER_HEIGHT = 260;
const EMPTY_HEIGHT = 200;

interface CrossVaultImagePickerModalProps {
    opened: boolean;
    onClose: () => void;
    playlistId: number;
    onSuccess: () => void;
}

interface ImageListResponse {
    items: ImageModel[];
    total: number;
    page: number;
    pages: number;
}

export function CrossVaultImagePickerModal({
    opened,
    onClose,
    playlistId,
    onSuccess,
}: CrossVaultImagePickerModalProps) {
    const { vaults } = useVault();

    // Default to the first available online vault, or the first vault
    const [selectedVaultId, setSelectedVaultId] = useState<string>(() => {
        const firstOnline = vaults.find((v) => v.status === 'online' || v.isLocal);
        return firstOnline?.id || vaults[0]?.id || '';
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [images, setImages] = useState<ImageModel[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);

    const selectedVault = vaults.find((v) => v.id === selectedVaultId);

    const vaultOptions = vaults.map((v) => {
        const isOnline = v.isLocal || v.status === 'online';
        return {
            value: v.id,
            label: `${v.label}${v.isLocal ? ' (Local)' : ''} — ${isOnline ? 'Online' : 'Offline'}`,
            disabled: !isOnline,
        };
    });

    const fetchImages = useCallback(async () => {
        if (!selectedVault) return;
        setIsLoading(true);
        setError(null);

        const offset = (page - 1) * PAGE_SIZE;
        const cleanUrl = selectedVault.url.replace(/\/+$/, '');
        const queryParams = new URLSearchParams({
            limit: String(PAGE_SIZE),
            offset: String(offset),
        });

        if (searchQuery.trim()) {
            queryParams.set('query', searchQuery.trim());
        }

        try {
            const headers: Record<string, string> = {};
            if (selectedVault.apiKey) {
                headers['X-API-Key'] = selectedVault.apiKey;
            }

            const endpoint = searchQuery.trim() ? `${cleanUrl}/api/search` : `${cleanUrl}/api/images`;
            const resp = await fetch(`${endpoint}?${queryParams.toString()}`, { headers });

            if (!resp.ok) {
                throw new Error(`Failed to fetch wallpapers: HTTP ${resp.status}`);
            }

            const data: ImageListResponse = await resp.json();
            setImages(data.items || []);
            setTotalPages(data.pages || Math.ceil((data.total || 0) / PAGE_SIZE) || 1);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to fetch wallpapers';
            setError(msg);
            setImages([]);
        } finally {
            setIsLoading(false);
        }
    }, [selectedVault, page, searchQuery]);

    useEffect(() => {
        if (opened && selectedVault) {
            fetchImages();
        }
    }, [opened, selectedVault, page, fetchImages]);

    const handleVaultChange = (vaultId: string | null) => {
        if (!vaultId) return;
        setSelectedVaultId(vaultId);
        setPage(1);
        setSelectedIds(new Set());
    };

    const toggleImageSelection = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleAddSelected = async () => {
        if (!selectedVault || selectedIds.size === 0) return;
        const targetVaultUUID = selectedVault.vaultId || selectedVault.id;

        setIsSubmitting(true);
        try {
            const payload = {
                images: Array.from(selectedIds).map((id) => ({
                    vault_id: targetVaultUUID,
                    image_id: id,
                })),
            };

            await AXIOS_INSTANCE.post(`/api/playlists/${playlistId}/cross-vault-images`, payload);

            notifications.show({
                title: 'Success',
                message: `Added ${selectedIds.size} wallpapers to playlist.`,
                color: 'green',
            });

            setSelectedIds(new Set());
            onClose();
            onSuccess();
        } catch (err: unknown) {
            const errorResponse = err as { response?: { data?: { detail?: string } } };
            const detail = errorResponse.response?.data?.detail || 'Failed to add wallpapers to playlist.';
            notifications.show({
                title: 'Error',
                message: detail,
                color: 'red',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Add Wallpapers from Vault"
            size="xl"
            styles={{ body: { minHeight: MODAL_MIN_HEIGHT } }}
        >
            <Stack gap="md">
                <Group grow>
                    <Select
                        label="Source Vault"
                        placeholder="Select vault to browse"
                        data={vaultOptions}
                        value={selectedVaultId}
                        onChange={handleVaultChange}
                        allowDeselect={false}
                    />
                    <TextInput
                        label="Search"
                        placeholder="Filter by title, tags..."
                        leftSection={<IconSearch size={16} />}
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.currentTarget.value);
                            setPage(1);
                        }}
                    />
                </Group>

                {error && (
                    <Alert icon={<IconAlertCircle size={16} />} color="red">
                        {error}
                    </Alert>
                )}

                {isLoading ? (
                    <Center h={LOADER_HEIGHT}>
                        <Loader size="lg" />
                    </Center>
                ) : images.length === 0 ? (
                    <Center h={EMPTY_HEIGHT}>
                        <Text c="dimmed">No wallpapers found in selected vault.</Text>
                    </Center>
                ) : (
                    <Box style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                        <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="xs">
                            {images.map((img) => {
                                const isSelected = selectedIds.has(img.id);
                                const cleanUrl = selectedVault?.url.replace(/\/+$/, '') || '';
                                const thumbUrl = `${cleanUrl}/api/thumbnails/${img.id}.webp`;

                                return (
                                    <Card
                                        key={img.id}
                                        padding="xs"
                                        withBorder
                                        style={{
                                            cursor: 'pointer',
                                            borderColor: isSelected ? 'var(--mantine-color-blue-filled)' : undefined,
                                            borderWidth: isSelected ? BORDER_WIDTH_SELECTED : BORDER_WIDTH_DEFAULT,
                                            position: 'relative',
                                        }}
                                        onClick={() => toggleImageSelection(img.id)}
                                    >
                                        <Card.Section>
                                            <MantineImage
                                                src={thumbUrl}
                                                h={THUMBNAIL_HEIGHT}
                                                fit="cover"
                                                alt={img.filename}
                                                fallbackSrc="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%23555'><rect width='100' height='100'/></svg>"
                                            />
                                        </Card.Section>
                                        <Group justify="space-between" mt="xs">
                                            <Text size="xs" truncate style={{ maxWidth: '80%' }}>
                                                {img.filename}
                                            </Text>
                                            <Checkbox
                                                checked={isSelected}
                                                onChange={() => toggleImageSelection(img.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                size="xs"
                                            />
                                        </Group>
                                    </Card>
                                );
                            })}
                        </SimpleGrid>
                    </Box>
                )}

                {totalPages > 1 && (
                    <Center>
                        <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
                    </Center>
                )}

                <Group justify="space-between" mt="md">
                    <Text size="sm" c="dimmed">
                        {selectedIds.size} wallpaper{selectedIds.size === 1 ? '' : 's'} selected
                    </Text>
                    <Group>
                        <Button variant="default" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAddSelected}
                            disabled={selectedIds.size === 0}
                            loading={isSubmitting}
                            leftSection={<IconCheck size={16} />}
                        >
                            Add Selected ({selectedIds.size})
                        </Button>
                    </Group>
                </Group>
            </Stack>
        </Modal>
    );
}
