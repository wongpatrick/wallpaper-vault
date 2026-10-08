/**
 * @file
 * Module: LightboxImageViewer Component
 * Description: Renders the centered full-resolution image container and floating navigation arrows for ImageLightbox.
 */
import { Center, Image, ActionIcon } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { getImageUrl } from '../../../utils/fileUtils';
import type { Image as ImageModel } from '../../../api/model';
import type { WithMultiVault } from '../../../types/vault';
import { ImageRating } from '../../../types/enums';

const ARROW_OFFSET_DEFAULT = 20;
const SIDEBAR_WIDTH = 320;
const ARROW_OFFSET_WITH_SIDEBAR = SIDEBAR_WIDTH + ARROW_OFFSET_DEFAULT;

export interface LightboxImageViewerProps {
    currentImage: ImageModel;
    borderColor: string;
    selectedIndex: number;
    totalImages: number;
    sidebarOpen: boolean;
    onPrev: () => void;
    onNext: () => void;
}

export function LightboxImageViewer({
    currentImage,
    borderColor,
    selectedIndex,
    totalImages,
    sidebarOpen,
    onPrev,
    onNext
}: LightboxImageViewerProps) {
    const rating = currentImage.rating || ImageRating.SAFE;
    const multiImage = currentImage as WithMultiVault<ImageModel>;

    return (
        <>
            <Center style={{ flex: 1, padding: '40px', position: 'relative' }}>
                <Image
                    src={getImageUrl(
                        currentImage.id, 
                        currentImage.phash || currentImage.file_size || undefined,
                        multiImage._vaultUrl,
                        multiImage._vaultApiKey
                    )}
                    style={{ 
                        maxHeight: '75vh', 
                        maxWidth: '100%', 
                        objectFit: 'contain',
                        border: rating !== ImageRating.SAFE ? `4px solid ${borderColor}` : 'none',
                        boxSizing: 'border-box',
                        borderRadius: '4px'
                    }}
                />
            </Center>

            {/* Navigation Arrows */}
            <ActionIcon 
                variant="transparent" 
                color="white" 
                size={60} 
                onClick={onPrev}
                disabled={selectedIndex === 0}
                style={{ position: 'absolute', left: ARROW_OFFSET_DEFAULT, top: '50%', transform: 'translateY(-50%)' }}
            >
                <IconChevronLeft size={48} />
            </ActionIcon>

            <ActionIcon 
                variant="transparent" 
                color="white" 
                size={60} 
                onClick={onNext}
                disabled={selectedIndex === totalImages - 1}
                style={{
                    position: 'absolute',
                    right: sidebarOpen ? ARROW_OFFSET_WITH_SIDEBAR : ARROW_OFFSET_DEFAULT,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    transition: 'right 0.2s ease'
                }}
            >
                <IconChevronRight size={48} />
            </ActionIcon>
        </>
    );
}
