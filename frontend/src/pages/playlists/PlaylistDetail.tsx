/**
 * @file
 * Module: Playlist Detail Page
 * Description: Displays a single custom collection of wallpapers, supporting local and cross-vault collections with drag-and-drop reordering.
 */
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Button, Center, Loader, Alert } from '@mantine/core';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { useVault } from '../../hooks/useVault';
import { PlaylistHeader } from './PlaylistHeader';
import { PlaylistImageList } from './PlaylistImageList';
import { PlaylistEmptyState } from './components/PlaylistEmptyState';
import { PlaylistDetailModals } from './components/PlaylistDetailModals';
import { usePlaylistDetail } from './hooks/usePlaylistDetail';
import { usePlaylistModals } from './hooks/usePlaylistModals';

const BACK_ICON_SIZE = 16;
const LOADER_CENTER_HEIGHT = 400;

export default function PlaylistDetail() {
    const { playlistId } = useParams<{ playlistId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const numericId = Number(playlistId);
    const { vaults } = useVault();

    const modals = usePlaylistModals();

    const {
        playlist,
        isLoading,
        error,
        refetch,
        isCrossVault,
        crossVaultImages,
        imagesWithOrder,
        imagesOnly,
        totalItemCount,
        dragAndDrop,
        handleMove,
        handleRemoveImage,
        handleRemoveCrossVaultImage,
        handleTriggerRandomPreview,
    } = usePlaylistDetail({
        numericId,
        onOpenLightbox: modals.openLightbox,
    });

    const handleBack = () => {
        if (location.state?.from) {
            navigate(-1);
        } else {
            navigate('/playlists');
        }
    };

    if (isLoading) {
        return (
            <Center h={LOADER_CENTER_HEIGHT}>
                <Loader size="xl" />
            </Center>
        );
    }

    if (error || !playlist) {
        return (
            <Container fluid px="xl">
                <Alert icon={<IconAlertCircle size="1.2rem" />} title="Error!" color="red" mb="md">
                    Could not fetch playlist details.
                </Alert>
                <Button 
                    variant="subtle" 
                    leftSection={<IconArrowLeft size={BACK_ICON_SIZE} />} 
                    onClick={handleBack}
                >
                    Back to {location.state?.fromLabel || 'Playlists'}
                </Button>
            </Container>
        );
    }

    return (
        <Container fluid px="xl">
            <Button
                variant="subtle"
                leftSection={<IconArrowLeft size={BACK_ICON_SIZE} />}
                onClick={handleBack}
                mb="xl"
            >
                Back to {location.state?.fromLabel || 'Playlists'}
            </Button>

            <PlaylistHeader
                name={playlist.name}
                description={playlist.description}
                isSmart={playlist.is_smart}
                isCrossVault={isCrossVault}
                totalItemCount={totalItemCount}
                onAddFromVault={modals.openAddVaultModal}
                onEdit={modals.openEditModal}
                onRandomPreview={handleTriggerRandomPreview}
                onCopyRotationUrl={modals.openRotationModal}
            />

            {totalItemCount === 0 ? (
                <PlaylistEmptyState
                    isSmart={playlist.is_smart}
                    isCrossVault={isCrossVault}
                    onAddFromVault={modals.openAddVaultModal}
                    onBrowseWallpapers={() => navigate('/images')}
                />
            ) : (
                <PlaylistImageList
                    isCrossVault={isCrossVault}
                    isSmart={playlist.is_smart}
                    crossVaultImages={crossVaultImages}
                    imagesWithOrder={imagesWithOrder}
                    vaults={vaults}
                    dragAndDrop={dragAndDrop}
                    onMove={handleMove}
                    onRemoveLocalImage={handleRemoveImage}
                    onRemoveCrossVaultImage={handleRemoveCrossVaultImage}
                    onImageClick={modals.openLightbox}
                />
            )}

            <PlaylistDetailModals
                playlist={playlist}
                numericId={numericId}
                isCrossVault={isCrossVault}
                imagesOnly={imagesOnly}
                modals={modals}
                refetch={refetch}
            />
        </Container>
    );
}
