/**
 * @file
 * Module: Images Directory Page
 * Description: Provides an infinite-scrolling gallery of all individual wallpapers with search, filtering, and lightbox viewing capabilities.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Container, Tabs } from '@mantine/core';
import { IconGridDots, IconPalette } from '@tabler/icons-react';
import { useMultiVaultImages } from '../../hooks/useMultiVaultQuery';
import { AggregatedVaultBanner } from '../../components/vault/AggregatedVaultBanner';
import { GalleryFilterBar } from '../../components/images/GalleryFilterBar';
import { ImageGrid } from '../../components/images/ImageGrid';
import { ColorExplorer } from './ColorExplorer';
import { useUrlPagination } from '../../hooks/useUrlPagination';
import { useSelection } from '../../hooks/useSelection';
import { useGalleryFilterState } from './hooks/useGalleryFilterState';
import { useGalleryModals } from './hooks/useGalleryModals';
import { useGalleryStream } from './hooks/useGalleryStream';
import { useGalleryBulkEdit } from './hooks/useGalleryBulkEdit';
import { GalleryHeader } from './components/GalleryHeader';
import { GallerySelectionBar } from './components/GallerySelectionBar';
import { GalleryModals } from './components/GalleryModals';

const PAGE_SIZE = 100;
const TAB_ICON_SIZE = 16;

export default function Images() {
    const { page, setPage } = useUrlPagination(PAGE_SIZE);

    // Modals state
    const modals = useGalleryModals();

    // Selection state
    const { 
        selectionMode, 
        setSelectionMode, 
        selectedIds: selectedImageIds, 
        toggle: toggleImageSelect, 
        clear: clearSelection 
    } = useSelection();

    // Stream state & filter reset bridging
    const filterResetRef = useRef<() => void>(() => {});
    const handleFilterReset = useCallback(() => {
        filterResetRef.current();
    }, []);

    const filters = useGalleryFilterState(handleFilterReset);

    // Fetch data
    const { 
        data: pageData, 
        isLoading, 
        isFetching, 
        error, 
        refetch,
        isAggregated,
        onlineCount,
        totalVaultsCount,
        offlineVaults,
        partialErrors
    } = useMultiVaultImages({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: filters.search || undefined,
        rating: filters.ratingFilter === 'all' ? undefined : filters.ratingFilter,
        tag: filters.tagFilter,
        color: filters.colorFilter,
        color_tolerance: filters.colorTolerance,
        character: filters.characterFilter ? [filters.characterFilter] : undefined,
        franchise: filters.franchiseFilter ? [filters.franchiseFilter] : undefined,
        sort_by: filters.sortBy,
        sort_dir: filters.sortDir
    });

    const handleImageRemoved = useCallback((deletedId: number) => {
        if (selectedImageIds.has(deletedId)) {
            toggleImageSelect(deletedId);
        }
    }, [selectedImageIds, toggleImageSelect]);

    const {
        allImages,
        columns,
        columnCount,
        hasMore,
        sentinelRef,
        handleFilterReset: resetStream,
        handleCollectionReset,
        handleDeleteImage,
    } = useGalleryStream({
        page,
        setPage,
        pageData,
        isLoading,
        isFetching,
        onImageRemoved: handleImageRemoved,
    });

    useEffect(() => {
        filterResetRef.current = resetStream;
    }, [resetStream]);

    const handleResetAndRefetch = useCallback(() => {
        handleCollectionReset();
        refetch();
    }, [handleCollectionReset, refetch]);

    const { handleBulkEditConfirm, isPending: bulkUpdatePending } = useGalleryBulkEdit({
        selectedImageIds,
        clearSelection,
        isAggregated,
        onSuccess: handleResetAndRefetch,
        onCloseModal: modals.closeBulkEdit,
    });

    const handleToggleSelectionMode = useCallback(() => {
        if (selectionMode) {
            clearSelection();
        } else {
            setSelectionMode(true);
        }
    }, [selectionMode, clearSelection, setSelectionMode]);

    return (
        <Container fluid px="xl">
            <AggregatedVaultBanner
                isAggregated={isAggregated}
                onlineCount={onlineCount}
                totalVaultsCount={totalVaultsCount}
                offlineVaults={offlineVaults}
                partialErrors={partialErrors}
            />

            <GalleryHeader
                selectionMode={selectionMode}
                onToggleSelectionMode={handleToggleSelectionMode}
            />

            <Tabs value={filters.activeTab} onChange={filters.handleTabChange} mb="xl">
                <Tabs.List mb="md">
                    <Tabs.Tab value="gallery" leftSection={<IconGridDots size={TAB_ICON_SIZE} />}>Gallery Filters</Tabs.Tab>
                    <Tabs.Tab value="explorer" leftSection={<IconPalette size={TAB_ICON_SIZE} />}>Color Explorer</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="gallery">
                    <GalleryFilterBar
                        localSearch={filters.localSearch}
                        onSearchChange={filters.handleSearchChange}
                        tagFilter={filters.tagFilter}
                        onClearTag={filters.handleClearTag}
                        characterFilter={filters.characterFilter || null}
                        onCharacterChange={filters.handleCharacterChange}
                        franchiseFilter={filters.franchiseFilter || null}
                        onFranchiseChange={filters.handleFranchiseChange}
                        ratingFilter={filters.ratingFilter}
                        onRatingChange={filters.handleRatingChange}
                    />
                </Tabs.Panel>
                
                <Tabs.Panel value="explorer">
                    <ColorExplorer 
                        activeColor={filters.colorFilter || undefined} 
                        onColorSelect={filters.handleColorChange}
                        onColorPickerChange={filters.handleColorPickerChange}
                        onClearColor={filters.handleClearColor}
                        tolerance={filters.colorTolerance}
                        onToleranceChange={filters.handleToleranceChange}
                    />
                </Tabs.Panel>
            </Tabs>

            <ImageGrid
                allImages={allImages}
                columns={columns}
                columnCount={columnCount}
                sentinelRef={sentinelRef}
                selection={{
                    mode: selectionMode,
                    selectedIds: selectedImageIds,
                    onToggle: toggleImageSelect,
                }}
                status={{
                    isLoading,
                    isFetching,
                    hasMore,
                    page,
                    error,
                }}
                onImageClick={modals.handleImageClick}
                onSetWallpaper={modals.handleSetWallpaper}
                isAggregated={isAggregated}
            />

            <GalleryModals 
                allImages={allImages}
                modals={modals}
                totalCount={pageData?.total}
                selectedImageIds={selectedImageIds}
                clearSelection={clearSelection}
                handleCollectionReset={handleResetAndRefetch}
                refetch={refetch}
                onDeleteImage={handleDeleteImage}
                onBulkEditConfirm={handleBulkEditConfirm}
                bulkUpdatePending={bulkUpdatePending}
            />

            <GallerySelectionBar
                selectionMode={selectionMode}
                selectedCount={selectedImageIds.size}
                onClear={clearSelection}
                onOpenBulkEdit={modals.openBulkEdit}
                onOpenAddToPlaylist={modals.openAddToPlaylist}
            />
        </Container>
    );
}
