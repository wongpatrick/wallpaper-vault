import { Card, Group, Stack, Text, Button, ThemeIcon } from '@mantine/core';
import { IconCrop, IconX, IconDownload } from '@tabler/icons-react';
import { useImageCropper } from './useImageCropper';
import { Dropzone } from './Dropzone';
import { CropperControls } from './CropperControls';
import { CropperArea } from './CropperArea';
import { CroppedPreview } from './CroppedPreview';

export function ImageCropper() {
    const {
        image,
        croppedImage,
        aspectRatio,
        setAspectRatio,
        customRatio,
        setCustomRatio,
        crop,
        imageRef,
        canvasRef,
        handleDrop,
        handleFileSelect,
        handleMouseDown,
        handleImageLoad,
        performCrop,
        downloadCropped,
        resetImage
    } = useImageCropper();

    return (
        <Card shadow="sm" padding="xl" radius="md" withBorder>
            {!image ? (
                <Dropzone onDrop={handleDrop} onFileSelect={handleFileSelect} />
            ) : (
                <Stack gap="md">
                    <Group justify="space-between">
                        <Group>
                            <ThemeIcon size={40} radius="md" variant="light" color="orange">
                                <IconCrop size={24} />
                            </ThemeIcon>
                            <div>
                                <Text fw={700}>Precision Cropper</Text>
                                <Text size="xs" c="dimmed">Drag to move, corner to resize.</Text>
                            </div>
                        </Group>

                        <Button 
                            variant="subtle" 
                            color="gray" 
                            leftSection={<IconX size={16} />} 
                            onClick={resetImage}
                        >
                            Reset
                        </Button>
                    </Group>

                    <CropperControls 
                        aspectRatio={aspectRatio}
                        setAspectRatio={setAspectRatio}
                        customRatio={customRatio}
                        setCustomRatio={setCustomRatio}
                    />

                    <Group gap="xl" align="flex-start">
                        <Stack style={{ flex: 1 }} gap="md">
                            <CropperArea 
                                image={image}
                                crop={crop}
                                imageRef={imageRef}
                                onMouseDown={handleMouseDown}
                                onImageLoad={handleImageLoad}
                            />

                            <Group grow>
                                <Button leftSection={<IconCrop size={18} />} onClick={performCrop} color="orange">
                                    Preview Result
                                </Button>
                                {croppedImage && (
                                    <Button leftSection={<IconDownload size={18} />} onClick={downloadCropped} color="green">
                                        Download
                                    </Button>
                                )}
                            </Group>
                        </Stack>

                        {croppedImage && (
                            <CroppedPreview 
                                croppedImage={croppedImage}
                                width={canvasRef.current?.width || 0}
                                height={canvasRef.current?.height || 0}
                            />
                        )}
                    </Group>
                </Stack>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </Card>
    );
}
