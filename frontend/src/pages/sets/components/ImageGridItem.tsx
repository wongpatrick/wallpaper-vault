import { Card, Image, Box, Text, Stack } from '@mantine/core';
import { getImageUrl } from '../../../utils/fileUtils';
import type { Image as ImageModel } from '../../../api/model';

interface ImageGridItemProps {
    image: ImageModel;
    onClick: () => void;
}

export function ImageGridItem({ image, onClick }: ImageGridItemProps) {
    return (
        <Card
            p={0}
            radius="xs" // More square-ish for that "fill" look
            withBorder={false} // Remove border for edge-to-edge feel
            className="image-card"
            style={{
                cursor: 'pointer',
                overflow: 'hidden',
                display: 'block',
                backgroundColor: 'transparent'
            }}
            onClick={onClick}
        >
            <Image
                src={getImageUrl(image.id)}
                alt={image.filename}
                loading="lazy"
                radius={0} // Ensure image itself has no radius inside card
                style={{ 
                    width: '100%', 
                    height: 'auto', 
                    display: 'block',
                    transition: 'transform 0.3s ease'
                }}
                className="grid-image"
            />
            
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
                    <Text size="xs" opacity={0.8}>{image.width} × {image.height}</Text>
                </Stack>
            </Box>
        </Card>
    );
}
