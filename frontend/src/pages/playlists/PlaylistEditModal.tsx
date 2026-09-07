/**
 * @file
 * Module: Playlist Edit Modal
 * Description: Wrapper for editing playlist details and metadata.
 */
import { PlaylistModal } from '../../components/playlists/PlaylistModal';
import type { PlaylistDetail } from '../../api/model';

interface PlaylistEditModalProps {
    opened: boolean;
    onClose: () => void;
    playlist?: PlaylistDetail;
    onSuccess: () => void;
}

export function PlaylistEditModal({
    opened,
    onClose,
    playlist,
    onSuccess
}: PlaylistEditModalProps) {
    if (!playlist) return null;

    return (
        <PlaylistModal
            opened={opened}
            onClose={onClose}
            playlist={playlist}
            onSuccess={onSuccess}
        />
    );
}
