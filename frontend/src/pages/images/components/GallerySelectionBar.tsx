/**
 * @file
 * Module: Gallery Selection Bar Component
 * Description: Floating action bar displayed when wallpaper selection mode is active with selected items.
 */
import { Button } from '@mantine/core';
import { IconPlaylist, IconEdit } from '@tabler/icons-react';
import { FloatingSelectionBar } from '../../../components/ui/FloatingSelectionBar';

const FLOATING_BAR_MIN_WIDTH = 300;
const ICON_SIZE = 14;

interface GallerySelectionBarProps {
    selectionMode: boolean;
    selectedCount: number;
    onClear: () => void;
    onOpenBulkEdit: () => void;
    onOpenAddToPlaylist: () => void;
}

export function GallerySelectionBar({
    selectionMode,
    selectedCount,
    onClear,
    onOpenBulkEdit,
    onOpenAddToPlaylist,
}: GallerySelectionBarProps) {
    return (
        <FloatingSelectionBar
            mounted={selectionMode && selectedCount > 0}
            selectedCount={selectedCount}
            onClear={onClear}
            itemLabel="images"
            minWidth={FLOATING_BAR_MIN_WIDTH}
        >
            <Button
                size="xs"
                variant="light"
                color="blue"
                leftSection={<IconEdit size={ICON_SIZE} />}
                radius="xl"
                onClick={onOpenBulkEdit}
            >
                Bulk Edit
            </Button>
            <Button
                size="xs"
                variant="light"
                color="violet"
                leftSection={<IconPlaylist size={ICON_SIZE} />}
                radius="xl"
                onClick={onOpenAddToPlaylist}
            >
                Add to Playlist
            </Button>
        </FloatingSelectionBar>
    );
}
