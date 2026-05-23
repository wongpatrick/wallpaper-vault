import { Card, Image, Box, Text, Stack, Badge, Group } from '@mantine/core';
import { IconAlertTriangle, IconExclamationCircle } from '@tabler/icons-react';
import { getImageUrl } from '../../../utils/fileUtils';
import type { Image as ImageModel } from '../../../api/model';

interface ImageGridItemProps {
    image: ImageModel;
    onClick: () => void;
}

export function ImageGridItem({ image, onClick }: ImageGridItemProps) {
    const rating = image.rating || 'safe';
    const dominantColor = image.dominant_color;
    
    const borderColor = rating === 'explicit' ? 'var(--mantine-color-red-filled)' : 
                        rating === 'questionable' ? 'var(--mantine-color-yellow-filled)' : 
                        'transparent';
    
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
                border: rating !== 'safe' ? `2px solid ${borderColor}` : undefined,
                boxSizing: 'border-box'
            }}
            onClick={onClick}
        >
            <Image
                src={getImageUrl(image.id)}
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
                    {rating !== 'safe' && (
                        <Badge 
                            color={rating === 'explicit' ? 'red' : 'yellow'} 
                            variant="filled" 
                            size="xs"
                            leftSection={rating === 'explicit' ? <IconExclamationCircle size={10} /> : <IconAlertTriangle size={10} />}
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
