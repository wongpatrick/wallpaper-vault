import { Modal, Box, Group, Stack, Text, Button, ActionIcon, Center, Image } from '@mantine/core';
import { IconWallpaper, IconX, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { getImageUrl } from '../../../utils/fileUtils';
import type { Image as ImageModel } from '../../../api/model';

interface LightboxProps {
    images: ImageModel[];
    selectedIndex: number | null;
    onClose: () => void;
    onSelectIndex: (index: number) => void;
}

export function Lightbox({ images, selectedIndex, onClose, onSelectIndex }: LightboxProps) {
    if (selectedIndex === null) return null;
    
    const currentImage = images[selectedIndex];

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (selectedIndex > 0) onSelectIndex(selectedIndex - 1);
    };

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (selectedIndex < images.length - 1) onSelectIndex(selectedIndex + 1);
    };

    return (
        <Modal
            opened={selectedIndex !== null}
            onClose={onClose}
            fullScreen
            padding={0}
            withCloseButton={false}
            styles={{
                content: { backgroundColor: 'rgba(0,0,0,0.95)' },
                body: { height: '100%', padding: 0 }
            }}
        >
            <Box style={{ height: '100vh', width: '100vw', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {/* Lightbox Header */}
                <Group justify="space-between" p="md" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
                    <Stack gap={0}>
                        <Text c="white" fw={600}>{currentImage.filename}</Text>
                        <Text c="gray.5" size="xs">
                            {currentImage.width} x {currentImage.height} • 
                            {((currentImage.file_size || 0) / 1024 / 1024).toFixed(2)} MB
                        </Text>
                    </Stack>
                    <Group>
                        <Button leftSection={<IconWallpaper size={18} />} color="blue" variant="filled">
                            Set as Wallpaper
                        </Button>
                        <ActionIcon variant="subtle" color="gray" size="xl" onClick={onClose}>
                            <IconX size={28} />
                        </ActionIcon>
                    </Group>
                </Group>

                {/* Main Image Area */}
                <Center style={{ flex: 1, padding: '40px' }}>
                    <Image 
                        src={getImageUrl(currentImage.id)}
                        style={{ maxHeight: '80vh', maxWidth: '100%', objectFit: 'contain' }}
                    />
                </Center>

                {/* Navigation Arrows */}
                <ActionIcon 
                    variant="transparent" 
                    color="white" 
                    size={60} 
                    onClick={handlePrev}
                    disabled={selectedIndex === 0}
                    style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)' }}
                >
                    <IconChevronLeft size={48} />
                </ActionIcon>
                
                <ActionIcon 
                    variant="transparent" 
                    color="white" 
                    size={60} 
                    onClick={handleNext}
                    disabled={selectedIndex === images.length - 1}
                    style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)' }}
                >
                    <IconChevronRight size={48} />
                </ActionIcon>

                {/* Thumbnails Strip */}
                <Box p="md" style={{ backgroundColor: 'rgba(0,0,0,0.5)', overflowX: 'auto' }}>
                    <Group gap="xs" wrap="nowrap" justify="center">
                        {images.map((img, idx) => (
                            <Box 
                                key={img.id}
                                onClick={() => onSelectIndex(idx)}
                                style={{ 
                                    width: 60, 
                                    height: 40, 
                                    cursor: 'pointer',
                                    border: selectedIndex === idx ? '2px solid var(--mantine-color-blue-filled)' : 'none',
                                    opacity: selectedIndex === idx ? 1 : 0.5,
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Image src={getImageUrl(img.id)} height={40} fit="cover" />
                            </Box>
                        ))}
                    </Group>
                </Box>
            </Box>
        </Modal>
    );
}
