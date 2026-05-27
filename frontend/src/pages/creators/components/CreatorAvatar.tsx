/**
 * @file
 * Module: Creator Avatar Component
 * Description: Displays a profile image for a creator, falling back to a generic user icon if no image is available.
 */
import { Box, Image, Center } from '@mantine/core';
import { IconUser } from '@tabler/icons-react';
import { getImageUrl } from '../../../utils/fileUtils';

interface CreatorAvatarProps {
    imageId: number | null | undefined;
    size?: number;
}

export function CreatorAvatar({ imageId, size = 60 }: CreatorAvatarProps) {
    // If no image, show generic icon
    if (!imageId) {
        return (
            <Center 
                w={size} h={size} 
                bg="blue.1" 
                style={{ borderRadius: '8px', overflow: 'hidden' }}
            >
                <IconUser size={size * 0.5} color="var(--mantine-color-blue-6)" />
            </Center>
        );
    }

    return (
        <Box w={size} h={size} style={{ borderRadius: '8px', overflow: 'hidden' }}>
            <Image 
                src={getImageUrl(imageId)} 
                height={size} 
                width={size}
                fit="cover" 
            />
        </Box>
    );
}
