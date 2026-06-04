/**
 * @file
 * Module: Image Grid Item
 * Description: Component for displaying a single image within a grid, featuring selection mode, rating badges, and overlay information.
 */
import { Card, Image, Box, Text, Stack, Badge, Group, Checkbox } from '@mantine/core';
import { IconAlertTriangle, IconExclamationCircle } from '@tabler/icons-react';
import { getThumbnailUrl } from '../../utils/fileUtils';
import type { Image as ImageModel } from '../../api/model';
import { useTimeout } from '@mantine/hooks';
import { useState } from 'react';
import { ImageRating } from '../../types/enums';

interface ImageGridItemProps {
    image: ImageModel;
    onClick: () => void;
    selectionMode?: boolean;
    selected?: boolean;
    onToggleSelect?: () => void;
}

const SCROLL_DEBOUNCE_MS = 500;
const OPACITY_UNSELECTED = 0.7;
const OPACITY_FULL = 1;

export function ImageGridItem({ image, onClick, selectionMode, selected, onToggleSelect }: ImageGridItemProps) {
    const rating = image.rating || ImageRating.SAFE;
    const dominantColor = image.dominant_color;
    const [longPressed, setLongPressed] = useState(false);
    
    const { start, clear } = useTimeout(() => {
        if (!selectionMode && onToggleSelect) {
            setLongPressed(true);
            onToggleSelect();
        }
    }, SCROLL_DEBOUNCE_MS);

    const borderColor = rating === ImageRating.EXPLICIT ? 'var(--mantine-color-red-filled)' : 
                        rating === ImageRating.QUESTIONABLE ? 'var(--mantine-color-yellow-filled)' : 
                        'transparent';
    
    const handleClick = (e: React.MouseEvent) => {
        if (longPressed) {
            setLongPressed(false);
            return;
        }

        if (selectionMode && onToggleSelect) {
            e.stopPropagation();
            onToggleSelect();
        } else {
            onClick();
        }
    };
    
    return (
        <Card
            p={0}
            radius="xs"
            withBorder={false}
            className="image-card"
            style={{
                cursor: 'pointer',
                overflow: 'hidden',
                display: 'block',
                backgroundColor: 'transparent',
                position: 'relative',
                border: rating !== ImageRating.SAFE ? `2px solid ${borderColor}` : undefined,
                boxSizing: 'border-box',
                opacity: selectionMode && !selected ? OPACITY_UNSELECTED : OPACITY_FULL,
                transform: selected ? 'scale(0.95)' : 'none',
                transition: 'all 0.2s ease',
                userSelect: 'none',
                WebkitUserSelect: 'none'
            }}
            onClick={handleClick}
            onMouseDown={start}
            onMouseUp={() => {
                clear();
            }}
            onMouseLeave={() => {
                clear();
                setLongPressed(false);
            }}
            onTouchStart={start}
            onTouchEnd={() => {
                clear();
            }}
        >
            <Image
                src={getThumbnailUrl(image.id, 'md')}
                alt={image.filename}
                loading="lazy"
                radius={0}
                style={{ 
                    width: '100%', 
                    height: 'auto', 
                    display: 'block',
                    transition: 'transform 0.3s ease'
                }}
                className="grid-image"
            />
            
            {/* Selection Checkbox */}
            {selectionMode && (
                <Box style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}>
                    <Checkbox 
                        checked={selected} 
                        onChange={() => onToggleSelect?.()} 
                        size="md"
                        radius="xl"
                        styles={{ input: { cursor: 'pointer' } }}
                    />
                </Box>
            )}

            {/* Top Badges */}
            <Box style={{ position: 'absolute', top: 8, right: 8, zIndex: 5, pointerEvents: 'none' }}>
                <Group gap={4}>
                    {dominantColor && (
                        <Box 
                            style={{ 
                                width: 12, 
                                height: 12, 
                                borderRadius: '50%', 
                                backgroundColor: dominantColor,
                                border: '1px solid rgba(255,255,255,0.5)',
                                boxShadow: '0 0 4px rgba(0,0,0,0.5)'
                            }} 
                        />
                    )}
                    {rating !== ImageRating.SAFE && (
                        <Badge 
                            color={rating === ImageRating.EXPLICIT ? 'red' : 'yellow'} 
                            variant="filled" 
                            size="xs"
                            leftSection={rating === ImageRating.EXPLICIT ? <IconExclamationCircle size={10} /> : <IconAlertTriangle size={10} />}
                            styles={{ 
                                root: { textTransform: 'uppercase', fontSize: '8px', padding: '0 4px' },
                                section: { marginRight: 2 }
                            }}
                        >
                            {rating}
                        </Badge>
                    )}
                </Group>
            </Box>
            
            <Box
                className="image-overlay"
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '12px 8px',
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                    color: 'white',
                    opacity: 0,
                    transition: 'opacity 0.2s ease',
                    pointerEvents: 'none'
                }}
            >
                <Stack gap={2}>
                    <Text size="xs" fw={700} truncate="end">{image.filename}</Text>
                    <Group gap={8}>
                        <Text size="xs" opacity={0.8}>{image.width} × {image.height}</Text>
                        {image.tags && (
                            <Text size="xs" c="blue.2" truncate="end" style={{ flex: 1 }}>
                                {image.tags}
                            </Text>
                        )}
                    </Group>
                </Stack>
            </Box>
        </Card>
    );
}
