/**
 * @file
 * Module: PlaylistDetailModals Component
 * Description: Renders lightbox, rotation URL, playlist edit, and cross-vault image picker modals.
 */
import { ImageLightbox } from '../../../components/images/ImageLightbox';
import { PlaylistRotationUrlModal } from '../../../components/playlists/PlaylistRotationUrlModal';
import { PlaylistEditModal } from '../PlaylistEditModal';
import { CrossVaultImagePickerModal } from '../../../components/playlists/CrossVaultImagePickerModal';
import type { Image as ImageModel } from '../../../api/model';
import type { ExtendedPlaylist } from '../hooks/usePlaylistDetail';
import type { usePlaylistModals } from '../hooks/usePlaylistModals';

interface PlaylistDetailModalsProps {
    playlist?: ExtendedPlaylist;
    numericId: number;
    isCrossVault: boolean;
    imagesOnly: ImageModel[];
    modals: ReturnType<typeof usePlaylistModals>;
    refetch: () => void;
}

export function PlaylistDetailModals({
    playlist,
    numericId,
    isCrossVault,
    imagesOnly,
    modals,
    refetch,
}: PlaylistDetailModalsProps) {
    const handleLightboxDelete = () => {
        refetch();
        modals.closeLightbox();
    };

    return (
        <>
            {/* Lightbox for viewing images */}
            {modals.lightboxImageIndex !== null && (
                <ImageLightbox
                    images={imagesOnly}
                    selectedIndex={modals.lightboxImageIndex}
                    onClose={modals.closeLightbox}
                    onSelectIndex={modals.setLightboxImageIndex}
                    onEdit={() => {}}
                    onDelete={handleLightboxDelete}
                    disableActions={true}
                />
            )}

            {/* Rotation URL Modal */}
            <PlaylistRotationUrlModal
                opened={modals.rotationModalOpened}
                onClose={modals.closeRotationModal}
                playlistId={numericId}
                playlistName={playlist?.name || ''}
            />

            {/* Edit Playlist Modal */}
            {playlist && (
                <PlaylistEditModal
                    opened={modals.editModalOpened}
                    onClose={modals.closeEditModal}
                    playlist={playlist}
                    onSuccess={() => refetch()}
                />
            )}

            {/* Cross Vault Image Picker Modal */}
            {isCrossVault && (
                <CrossVaultImagePickerModal
                    opened={modals.addVaultModalOpened}
                    onClose={modals.closeAddVaultModal}
                    playlistId={numericId}
                    onSuccess={() => refetch()}
                />
            )}
        </>
    );
}
