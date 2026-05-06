import { Card, Image, Box, Text } from '@mantine/core';
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
            radius="md" 
            withBorder 
            className="image-card"
            style={{ 
                cursor: 'pointer', 
                overflow: 'hidden',
                marginBottom: '16px', // Gap between items in the column
                breakInside: 'avoid', // Prevent card from breaking across columns
                display: 'block'
            }}
            onClick={onClick}
        >
            <Image 
                src={getImageUrl(image.id)} 
                alt={image.filename}
                loading="lazy"
                style={{ width: '100%', height: 'auto', display: 'block' }}
            />
            <Box
                className="image-overlay"
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '8px',
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                    color: 'white',
                    opacity: 0,
                    transition: 'opacity 0.2s ease',
                    pointerEvents: 'none'
                }}
            >
                <Text size="xs" fw={500}>{image.width}x{image.height}</Text>
            </Box>
        </Card>
    );
}
