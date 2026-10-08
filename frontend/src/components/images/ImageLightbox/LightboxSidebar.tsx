/**
 * @file
 * Module: LightboxSidebar Component
 * Description: Collapsible sidebar for ImageLightbox for viewing and inline-editing image tags and characters.
 */
import { Box, ScrollArea, Stack, Group, Text, Loader } from '@mantine/core';
import { TagAutocompleteInput } from '../../ui/TagAutocompleteInput';
import { CharacterTagsInput } from '../../ui/CharacterTagsInput';
import { useReadImageApiImagesImageIdGet, useUpdateImageApiImagesImageIdPatch } from '../../../api/generated/images/images';
import { useAppNotifications } from '../../../hooks/useAppNotifications';
import { useVault } from '../../../hooks/useVault';
import type { Image as ImageModel } from '../../../api/model';
import type { WithMultiVault } from '../../../types/vault';

const SIDEBAR_WIDTH = 320;
const TAG_NOTIFICATION_AUTO_CLOSE_MS = 1500;

export interface LightboxSidebarProps {
    currentImage: ImageModel;
    opened: boolean;
    onUpdated?: () => void;
}

export function LightboxSidebar({
    currentImage,
    opened,
    onUpdated
}: LightboxSidebarProps) {
    const { showNotification } = useAppNotifications();
    const { isAggregated, activeVault, switchVault } = useVault();
    const updateMutation = useUpdateImageApiImagesImageIdPatch();

    // Fetch individual image details (including tags)
    const { data: imageDetail, refetch: refetchImageDetail, isFetching: isDetailFetching } = useReadImageApiImagesImageIdGet(
        currentImage.id,
        undefined,
        {
            query: {
                enabled: opened && !!currentImage.id && (!isAggregated || (currentImage as WithMultiVault<ImageModel>)._vaultId === activeVault.id)
            }
        }
    );

    const handleUpdateTags = async (newTags: string[]) => {
        try {
            const multiImage = currentImage as WithMultiVault<ImageModel>;
            if (isAggregated && multiImage._vaultId && activeVault.id !== multiImage._vaultId) {
                await switchVault(multiImage._vaultId);
            }
            await updateMutation.mutateAsync({
                imageId: currentImage.id,
                data: { tags: newTags }
            });
            showNotification({
                title: 'Tags Updated',
                message: 'Tags saved successfully',
                color: 'green',
                autoClose: TAG_NOTIFICATION_AUTO_CLOSE_MS
            });
            refetchImageDetail();
            onUpdated?.();
        } catch {
            showNotification({ title: 'Error', message: 'Failed to update tags', color: 'red' });
        }
    };

    const handleUpdateCharacters = async (newCharacters: string[]) => {
        try {
            const multiImage = currentImage as WithMultiVault<ImageModel>;
            if (isAggregated && multiImage._vaultId && activeVault.id !== multiImage._vaultId) {
                await switchVault(multiImage._vaultId);
            }
            await updateMutation.mutateAsync({
                imageId: currentImage.id,
                data: { characters: newCharacters }
            });
            showNotification({
                title: 'Characters Updated',
                message: 'Characters saved successfully',
                color: 'green',
                autoClose: TAG_NOTIFICATION_AUTO_CLOSE_MS
            });
            refetchImageDetail();
            onUpdated?.();
        } catch {
            showNotification({ title: 'Error', message: 'Failed to update characters', color: 'red' });
        }
    };

    if (!opened) return null;

    return (
        <Box 
            style={{ 
                width: SIDEBAR_WIDTH, 
                borderLeft: '1px solid var(--mantine-color-dark-4)', 
                backgroundColor: 'rgba(20, 20, 20, 0.95)',
                display: 'flex', 
                flexDirection: 'column', 
                padding: '24px 16px',
                boxSizing: 'border-box',
                zIndex: 10
            }}
        >
            <ScrollArea h="100%">
                <Stack gap="md">
                    <Group justify="space-between" align="center">
                        <Text fw={600} size="lg" c="white">Wallpaper Tags</Text>
                        {(isDetailFetching || updateMutation.isPending) && (
                            <Loader size="xs" color="blue" />
                        )}
                    </Group>
                    
                    <Box>
                        <Text fw={500} size="sm" c="gray.3" mb={6}>General Tags</Text>
                        <TagAutocompleteInput 
                            label=""
                            placeholder="Add tags..."
                            value={imageDetail?.tags || []}
                            onChange={handleUpdateTags}
                        />
                    </Box>

                    <Box>
                        <Text fw={500} size="sm" c="gray.3" mb={6}>Characters</Text>
                        <CharacterTagsInput 
                            placeholder="Add characters..."
                            value={imageDetail?.characters || []}
                            onChange={handleUpdateCharacters}
                        />
                    </Box>
                    
                    <Text size="xs" c="dimmed">
                        Tags and characters are saved automatically.
                    </Text>
                </Stack>
            </ScrollArea>
        </Box>
    );
}
