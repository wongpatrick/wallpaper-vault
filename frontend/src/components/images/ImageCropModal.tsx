/**
 * @file
 * Module: ImageCropModal Component
 * Description: Interactive modal for visual aspect-ratio selection, saliency-guided crop auto-detection,
 * and custom crop viewport adjustment for wallpapers.
 */
import { Modal, Box, Group, Text, Center, Image } from '@mantine/core';
import { IconCrop } from '@tabler/icons-react';
import { getImageUrl } from '../../utils/fileUtils';
import { CropOverlayGrid } from '../ui/CropOverlayGrid';
import type { Image as ImageModel } from '../../api/model';
import { useCropModalState } from './hooks/useCropModalState';
import { ImageCropControls } from './crop/ImageCropControls';

export interface ImageCropModalProps {
    image: ImageModel | null;
    opened: boolean;
    onClose: () => void;
    onCropSuccess?: (updatedImage: ImageModel) => void;
    zIndex?: number;
}

const MODAL_Z_INDEX = 3000;

export function ImageCropModal({ image, opened, onClose, onCropSuccess, zIndex = MODAL_Z_INDEX }: ImageCropModalProps) {
    const {
        aspectRatio,
        handleAspectRatioChange,
        saveMode,
        setSaveMode,
        cropSize,
        setCropSize,
        customWidth,
        setCustomWidth,
        customHeight,
        setCustomHeight,
        displayDimensions,
        displayBox,
        originalCropW,
        originalCropH,
        clampedCropX,
        clampedCropY,
        isDragging,
        isPending,
        imageRef,
        handleImageLoad,
        handleMouseDown,
        handleSave
    } = useCropModalState({
        image,
        opened,
        onClose,
        onCropSuccess
    });

    if (!image) return null;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            size="90%"
            zIndex={zIndex}
            title={
                <Group gap="xs">
                    <IconCrop size={20} style={{ color: 'var(--mantine-color-blue-filled)' }} />
                    <Text fw={600} size="lg">Saliency Cropping Tool</Text>
                    <Text size="xs" c="dimmed">({image.filename})</Text>
                </Group>
            }
            centered
            styles={{
                content: { display: 'flex', flexDirection: 'column', height: '85vh' },
                body: { flex: 1, display: 'flex', overflow: 'hidden', padding: 'var(--mantine-spacing-md)' }
            }}
        >
            <Box style={{ flex: 1, display: 'flex', gap: 'var(--mantine-spacing-lg)', overflow: 'hidden', width: '100%' }}>
                {/* Visual Cropper Area */}
                <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <Center style={{ flex: 1, overflow: 'hidden', padding: '20px' }}>
                        <Box style={{ position: 'relative', display: 'inline-block', overflow: 'hidden' }}>
                            <Image
                                ref={imageRef}
                                src={getImageUrl(image.id, image.phash || image.file_size || undefined)}
                                alt="Crop target"
                                onLoad={handleImageLoad}
                                style={{
                                    maxHeight: '65vh',
                                    maxWidth: '100%',
                                    objectFit: 'contain',
                                    userSelect: 'none'
                                }}
                            />
                            
                            {displayDimensions && (
                                <Box
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: displayDimensions.width,
                                        height: displayDimensions.height,
                                        pointerEvents: 'none'
                                    }}
                                >
                                    {/* Crop Box Viewport */}
                                    <Box
                                        onMouseDown={handleMouseDown}
                                        style={{
                                            position: 'absolute',
                                            left: displayBox.x,
                                            top: displayBox.y,
                                            width: displayBox.w,
                                            height: displayBox.h,
                                            border: '2px solid var(--mantine-color-blue-6)',
                                            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                                            cursor: isDragging ? 'grabbing' : 'grab',
                                            pointerEvents: 'auto',
                                            boxSizing: 'border-box'
                                        }}
                                    >
                                        {/* Crop Overlay Guidelines */}
                                        <CropOverlayGrid color="rgba(255,255,255,0.4)" lineStyle="dashed" />
                                        
                                        {/* Aspect Ratio Badge inside Crop Box */}
                                        <Box style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px' }}>
                                            <Text size="xs" c="white" fw={500}>{aspectRatio}</Text>
                                        </Box>
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    </Center>
                </Box>
                
                {/* Control Panel */}
                <ImageCropControls
                    image={image}
                    aspectRatio={aspectRatio}
                    onAspectRatioChange={handleAspectRatioChange}
                    saveMode={saveMode}
                    onSaveModeChange={setSaveMode}
                    cropSize={cropSize}
                    onCropSizeChange={setCropSize}
                    customWidth={customWidth}
                    onCustomWidthChange={setCustomWidth}
                    customHeight={customHeight}
                    onCustomHeightChange={setCustomHeight}
                    displayDimensions={displayDimensions}
                    originalCropW={originalCropW}
                    originalCropH={originalCropH}
                    clampedCropX={clampedCropX}
                    clampedCropY={clampedCropY}
                    isPending={isPending}
                    onClose={onClose}
                    onSave={handleSave}
                />
            </Box>
        </Modal>
    );
}
