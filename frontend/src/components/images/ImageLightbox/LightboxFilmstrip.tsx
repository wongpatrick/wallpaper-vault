/**
 * @file
 * Module: LightboxFilmstrip Component
 * Description: Bottom carousel filmstrip for ImageLightbox showing thumbnail cards and counter indicator.
 */
import { useMemo } from 'react';
import { Box, Text, Group, Image } from '@mantine/core';
import { getThumbnailUrl } from '../../../utils/fileUtils';
import type { Image as ImageModel } from '../../../api/model';
import type { WithMultiVault } from '../../../types/vault';
import { ImageRating } from '../../../types/enums';

const FILMSTRIP_VISIBLE = 7;
const FILMSTRIP_HALF = 3;
const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 100;
const THUMB_GAP = 8;
const OPACITY_FULL = 1;
const OPACITY_DIMMED = 0.5;

export interface LightboxFilmstripProps {
    images: WithMultiVault<ImageModel>[];
    selectedIndex: number;
    totalCount?: number;
    onSelectIndex: (index: number) => void;
}

export function LightboxFilmstrip({
    images,
    selectedIndex,
    totalCount,
    onSelectIndex
}: LightboxFilmstripProps) {
    // Calculate window of visible thumbnails in filmstrip (centered on selectedIndex)
    const filmstripWindow = useMemo(() => {
        if (selectedIndex === null || images.length === 0) return [];

        let start = Math.max(0, selectedIndex - FILMSTRIP_HALF);
        const end = Math.min(images.length, start + FILMSTRIP_VISIBLE);

        // Adjust start if we are near the end
        if (end - start < FILMSTRIP_VISIBLE) {
            start = Math.max(0, end - FILMSTRIP_VISIBLE);
        }

        return images.slice(start, end).map((img, i) => ({
            index: start + i,
            image: img,
        }));
    }, [selectedIndex, images]);

    return (
        <Box 
            p="md" 
            style={{ 
                backgroundColor: 'rgba(0,0,0,0.6)', 
                backdropFilter: 'blur(8px)',
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                gap: 8 
            }}
        >
            {/* Position Counter */}
            <Text c="gray.4" size="xs" fw={600}>
                {selectedIndex + 1} / {totalCount || images.length}
            </Text>

            {/* Filmstrip */}
            <Group gap={THUMB_GAP} wrap="nowrap" justify="center">
                {filmstripWindow.map(({ index, image: img }) => {
                    const imgRating = img.rating || ImageRating.SAFE;
                    const isActive = index === selectedIndex;

                    return (
                        <Box 
                            key={img.id} 
                            onClick={() => onSelectIndex(index)}
                            style={{ 
                                width: THUMB_WIDTH, 
                                height: THUMB_HEIGHT, 
                                cursor: 'pointer', 
                                borderRadius: 6,
                                overflow: 'hidden',
                                border: isActive 
                                     ? '3px solid var(--mantine-color-blue-filled)' 
                                     : imgRating !== ImageRating.SAFE 
                                         ? `2px solid ${imgRating === ImageRating.EXPLICIT ? 'var(--mantine-color-red-filled)' : 'var(--mantine-color-yellow-filled)'}`
                                         : '2px solid transparent',
                                opacity: isActive ? OPACITY_FULL : OPACITY_DIMMED,
                                transition: 'all 0.2s ease',
                                flexShrink: 0,
                                transform: isActive ? 'scale(1.05)' : 'scale(1)',
                            }}
                        >
                            <Image 
                                src={getThumbnailUrl(
                                    img.id, 
                                    'sm', 
                                    img.phash || img.file_size || undefined,
                                    (img as WithMultiVault<ImageModel>)._vaultUrl,
                                    (img as WithMultiVault<ImageModel>)._vaultApiKey
                                )} 
                                height={THUMB_HEIGHT} 
                                width={THUMB_WIDTH}
                                fit="cover" 
                                style={{ display: 'block' }}
                            />
                        </Box>
                    );
                })}
            </Group>
        </Box>
    );
}
