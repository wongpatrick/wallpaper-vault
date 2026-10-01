/**
 * @file SetDetail page component for displaying and managing set images and metadata.
 * Module: Set Detail Page
 * Description: Displays detailed information and a gallery view for a specific wallpaper set, supporting selection, bulk editing, and syncing.
 */
import { useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSelection } from '../../hooks/useSelection';
import { Container, Loader, Center, Alert, Button } from '@mantine/core';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { useReadSetApiSetsSetIdGet } from '../../api/generated/sets/sets';
import { FloatingSelectionBar } from '../../components/ui/FloatingSelectionBar';
import { useTasks } from '../../hooks/useTasks';
import { SetHeader } from './components/SetHeader';
import { SetImageGallery } from './components/SetImageGallery';
import { SetDetailModals } from './components/SetDetailModals';
import { useSetModals } from './hooks/useSetModals';
import { useSetMutations } from './hooks/useSetMutations';

export default function SetDetail() {
    const { setId } = useParams<{ setId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // Queries
    const { data: set, isLoading, error, refetch } = useReadSetApiSetsSetIdGet(Number(setId));

    // Selection State
    const { 
        selectionMode, 
        setSelectionMode, 
        selectedIds: selectedImageIds, 
        toggle: toggleImageSelect, 
        selectAll, 
        clear: clearSelection 
    } = useSelection();

    // Modals & Active Image State
    const modals = useSetModals();

    // Mutations & Actions
    const {
        handleDelete,
        handleOpenFolder,
        handleResync,
        handleAutoTag,
        handleBulkEditConfirm,
        handleMoveSuccess,
        resyncPending,
        autoTagPending,
        bulkUpdatePending
    } = useSetMutations({
        set,
        setId,
        refetch,
        selectedImageIds,
        clearSelection,
        closeModal: modals.closeModal,
        setMovingSingleImage: modals.setMovingSingleImage
    });

    // Background Tasks
    const { getTaskForSet, tasks } = useTasks();
    const activeTask = getTaskForSet(Number(setId));
    const isLocalTaggingActive = activeTask?.status === 'accepted' || activeTask?.status === 'processing';
    const isAnyTaggingActive = useMemo(() => {
        return Object.values(tasks).some(
            (t) => t.id.startsWith('autotag-') && (t.status === 'accepted' || t.status === 'processing')
        );
    }, [tasks]);

    const handleSelectAll = () => {
        if (!set?.images) return;
        selectAll(set.images.map(img => img.id));
    };

    if (isLoading) {
        return <Center h={400}><Loader size="xl" /></Center>;
    }

    if (error || !set) {
        return (
            <Container fluid px="xl">
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error!" color="red">
                    Could not fetch the set details.
                </Alert>
                <Button 
                    variant="subtle" 
                    leftSection={<IconArrowLeft size={16} />} 
                    onClick={() => {
                        if (location.state?.from) {
                            navigate(-1);
                        } else {
                            navigate('/sets');
                        }
                    }} 
                    mt="md"
                >
                    Back to {location.state?.fromLabel || "Library"}
                </Button>
            </Container>
        );
    }

    return (
        <Container fluid px="xl" pb={selectionMode ? 100 : "xl"} pos="relative">
            <SetHeader 
                set={set}
                selectionMode={selectionMode}
                setSelectionMode={setSelectionMode}
                selectedImageIds={selectedImageIds}
                clearSelection={clearSelection}
                handleSelectAll={handleSelectAll}
                handleResync={handleResync}
                handleOpenFolder={handleOpenFolder}
                onOpenEditModal={() => modals.openModal('editSet')}
                handleAutoTag={handleAutoTag}
                handleDelete={handleDelete}
                resyncPending={resyncPending}
                autoTagPending={autoTagPending}
                isLocalTaggingActive={isLocalTaggingActive}
                isAnyTaggingActive={isAnyTaggingActive}
            />

            <SetImageGallery 
                images={set.images}
                selectionMode={selectionMode}
                selectedImageIds={selectedImageIds}
                toggleImageSelect={toggleImageSelect}
                onImageClick={modals.handleImageClick}
                onSetWallpaper={modals.handleSetWallpaper}
            />

            <SetDetailModals 
                set={set}
                setId={setId}
                modals={modals}
                bulkUpdatePending={bulkUpdatePending}
                onBulkEditConfirm={handleBulkEditConfirm}
                onMoveSuccess={handleMoveSuccess}
                selectedImageIds={selectedImageIds}
                clearSelection={clearSelection}
                refetch={refetch}
            />

            {/* Floating Selection Bar */}
            <FloatingSelectionBar 
                mounted={selectionMode}
                selectedCount={selectedImageIds.size}
                onClear={clearSelection}
            >
                <Button variant="light" size="xs" disabled={selectedImageIds.size === 0} onClick={() => modals.openModal('bulkEdit')}>Bulk Edit</Button>
                <Button variant="light" size="xs" disabled={selectedImageIds.size === 0} onClick={() => modals.openModal('move')}>Move</Button>
                <Button variant="light" size="xs" disabled={selectedImageIds.size === 0} onClick={() => modals.openModal('addToPlaylist')}>Add to Playlist</Button>
            </FloatingSelectionBar>
        </Container>
    );
}
