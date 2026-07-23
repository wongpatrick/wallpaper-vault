/**
 * @file Masonry image grid gallery component for SetDetail page.
 */
/* eslint-disable no-magic-numbers */
import { Box } from '@mantine/core';
import { ImageGridItem } from '../../../components/images/ImageGridItem';
import type { Image as ImageModel } from '../../../api/model';
import styles from '../SetDetail.module.css';

interface SetImageGalleryProps {
    images: ImageModel[] | undefined;
    selectionMode: boolean;
    selectedImageIds: Set<number>;
    toggleImageSelect: (id: number) => void;
    onImageClick: (index: number) => void;
    onEditImage: (image: ImageModel) => void;
    onCropImage: (image: ImageModel) => void;
    onMoveImage: (image: ImageModel) => void;
}

export function SetImageGallery({
    images,
    selectionMode,
    selectedImageIds,
    toggleImageSelect,
    onImageClick,
    onEditImage,
    onCropImage,
    onMoveImage,
}: SetImageGalleryProps) {
    if (!images || images.length === 0) {
        return null;
    }

    return (
        <Box className={styles.masonryGrid}>
            {images.map((image, index) => (
                <div key={image.id} className={styles.imageCard}>
                    <ImageGridItem 
                        image={image} 
                        selectionMode={selectionMode}
                        isSelected={selectedImageIds.has(image.id)}
                        onSelectToggle={() => toggleImageSelect(image.id)}
                        onClick={() => onImageClick(index)}
                        onEdit={() => onEditImage(image)}
                        onCrop={() => onCropImage(image)}
                        onMove={() => onMoveImage(image)}
                    />
                </div>
            ))}
        </Box>
    );
}
