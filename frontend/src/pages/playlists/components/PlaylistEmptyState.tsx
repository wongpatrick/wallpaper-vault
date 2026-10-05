/**
 * @file
 * Module: PlaylistEmptyState Component
 * Description: Renders empty state placeholder with call-to-actions for local, smart, and cross-vault playlists.
 */
import { Center, Text, Button } from '@mantine/core';
import { IconPlaylist, IconPlus } from '@tabler/icons-react';

const ICON_SIZE = 48;
const BUTTON_ICON_SIZE = 16;
const ICON_OPACITY = 0.1;

interface PlaylistEmptyStateProps {
    isSmart?: boolean;
    isCrossVault: boolean;
    onAddFromVault: () => void;
    onBrowseWallpapers: () => void;
}

export function PlaylistEmptyState({
    isSmart,
    isCrossVault,
    onAddFromVault,
    onBrowseWallpapers,
}: PlaylistEmptyStateProps) {
    let emptyDescription = 'Go to individual wallpapers or sets and select images to add them here.';
    if (isSmart) {
        emptyDescription = 'No wallpapers match your current rules. Try adjusting the filter criteria.';
    } else if (isCrossVault) {
        emptyDescription = 'Add wallpapers across your connected vaults to populate this playlist.';
    }

    return (
        <Center style={{ minHeight: '30vh', flexDirection: 'column' }}>
            <IconPlaylist size={ICON_SIZE} style={{ opacity: ICON_OPACITY }} />
            <Text size="lg" fw={600} c="dimmed" mt="md">
                {isSmart ? 'No matching wallpapers' : 'This playlist is empty'}
            </Text>
            <Text c="dimmed" size="sm" mt={4} mb="xl">
                {emptyDescription}
            </Text>
            {isCrossVault ? (
                <Button
                    variant="filled"
                    color="indigo"
                    leftSection={<IconPlus size={BUTTON_ICON_SIZE} />}
                    onClick={onAddFromVault}
                >
                    Add from Vault
                </Button>
            ) : (
                !isSmart && (
                    <Button variant="outline" onClick={onBrowseWallpapers}>
                        Browse Wallpapers
                    </Button>
                )
            )}
        </Center>
    );
}
