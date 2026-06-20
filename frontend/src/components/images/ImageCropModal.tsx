/**
 * @file
 * Module: ImageCropModal Component
 * Description: Interactive modal for visual aspect-ratio selection, saliency-guided crop auto-detection,
 * and custom crop viewport adjustment for wallpapers.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Modal, Box, Group, Stack, Text, Button, Select, Slider, SegmentedControl, Center, Image } from '@mantine/core';
import type { ComboboxProps } from '@mantine/core';
import { IconX, IconCrop } from '@tabler/icons-react';
import { getImageUrl } from '../../utils/fileUtils';
import { useCropImageApiImagesImageIdCropPost } from '../../api/generated/images/images';
import { notifications } from '@mantine/notifications';
import type { Image as ImageModel } from '../../api/model';

interface ImageCropModalProps {
    image: ImageModel | null;
    opened: boolean;
    onClose: () => void;
    onCropSuccess?: (updatedImage: ImageModel) => void;
    zIndex?: number;
}

const MODAL_Z_INDEX = 3000;
const MIN_CROP_PERCENT = 20;
const MAX_CROP_PERCENT = 100;
const DEFAULT_CROP_PERCENT = 80;
const PERCENT_SCALE = 100;
const DEFAULT_ASPECT_RATIO_NUMERATOR = 16;
const DEFAULT_ASPECT_RATIO_DENOMINATOR = 9;
const DEFAULT_CUSTOM_CROP_OFFSET_RATIO = 0.1;

export function ImageCropModal({ image, opened, onClose, onCropSuccess, zIndex = MODAL_Z_INDEX }: ImageCropModalProps) {
    const { mutateAsync, isPending } = useCropImageApiImagesImageIdCropPost();
    
    const [aspectRatio, setAspectRatio] = useState<string>("16:9");
    const [saveMode, setSaveMode] = useState<string>("new");
    const [cropSize, setCropSize] = useState<number>(DEFAULT_CROP_PERCENT);
    const [customWidth, setCustomWidth] = useState<number>(DEFAULT_CROP_PERCENT);
    const [customHeight, setCustomHeight] = useState<number>(DEFAULT_CROP_PERCENT);
    const [displayDimensions, setDisplayDimensions] = useState<{ width: number; height: number } | null>(null);
    const [cropX, setCropX] = useState<number>(0);
    const [cropY, setCropY] = useState<number>(0);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    
    const imageRef = useRef<HTMLImageElement>(null);

    // Parse ratio string (e.g. "16:9") to float safely using destructuring
    const currentAR = useMemo(() => {
        try {
            const [numeratorStr, denominatorStr] = aspectRatio.split(":");
            return parseFloat(numeratorStr) / parseFloat(denominatorStr);
        } catch {
            return DEFAULT_ASPECT_RATIO_NUMERATOR / DEFAULT_ASPECT_RATIO_DENOMINATOR;
        }
    }, [aspectRatio]);
    // Trigger preview fetch from backend when aspect ratio changes
    useEffect(() => {
        if (!opened || !image || !displayDimensions) return;
        if (aspectRatio === "custom") return;
        
        const fetchPreview = async () => {
            try {
                const res = await mutateAsync({
                    imageId: image.id,
                    data: {
                        aspect_ratio: aspectRatio,
                        save_mode: "new",
                        preview_only: true
                    }
                });
                
                if (res.x !== undefined && res.x !== null &&
                    res.y !== undefined && res.y !== null &&
                    res.width !== undefined && res.width !== null) {
                    setCropX(res.x);
                    setCropY(res.y);
                    
                    // Set cropSize based on the calculated crop box relative to max dimensions
                    const maxW = image.width || 1;
                    const maxH = image.height || 1;
                    let maxCropW = maxW;
                    if (maxW / maxH >= currentAR) {
                        maxCropW = maxH * currentAR;
                    }
                    const pct = Math.round((res.width / maxCropW) * PERCENT_SCALE);
                    setCropSize(pct);
                }
            } catch (err) {
                console.error("Failed to fetch crop preview", err);
            }
        };
        
        fetchPreview();
    }, [aspectRatio, displayDimensions, image, opened, currentAR, mutateAsync]);
    
    // Compute current crop box size in original coordinates
    const originalCropW = useMemo(() => {
        if (!image) return 0;
        if (aspectRatio === "custom") {
            return (image.width || 1) * (customWidth / PERCENT_SCALE);
        }
        const maxW = image.width || 1;
        const maxH = image.height || 1;
        
        let maxCropW = maxW;
        if (maxW / maxH >= currentAR) {
            maxCropW = maxH * currentAR;
        }
        return maxCropW * (cropSize / PERCENT_SCALE);
    }, [image, aspectRatio, currentAR, cropSize, customWidth]);

    const originalCropH = useMemo(() => {
        if (!image) return 0;
        if (aspectRatio === "custom") {
            return (image.height || 1) * (customHeight / PERCENT_SCALE);
        }
        const maxW = image.width || 1;
        const maxH = image.height || 1;
        
        let maxCropH = maxH;
        if (maxW / maxH < currentAR) {
            maxCropH = maxW / currentAR;
        }
        return maxCropH * (cropSize / PERCENT_SCALE);
    }, [image, aspectRatio, currentAR, cropSize, customHeight]);

    // Derived clamped coordinates in original space
    const maxOriginalW = image?.width || 1;
    const maxOriginalH = image?.height || 1;
    
    const clampedCropX = Math.max(0, Math.min(cropX, maxOriginalW - originalCropW));
    const clampedCropY = Math.max(0, Math.min(cropY, maxOriginalH - originalCropH));

    // Convert to display coordinates
    const scale = displayDimensions && image && image.width ? displayDimensions.width / image.width : 1;
    
    const displayBox = {
        x: clampedCropX * scale,
        y: clampedCropY * scale,
        w: originalCropW * scale,
        h: originalCropH * scale
    };

    const handleImageLoad = () => {
        if (imageRef.current && image) {
            const dims = {
                width: imageRef.current.clientWidth,
                height: imageRef.current.clientHeight
            };
            setDisplayDimensions(dims);
            
            const maxW = image.width || 1;
            const maxH = image.height || 1;
            let cw = maxW;
            let ch = maxH;
            if (maxW / maxH >= currentAR) {
                cw = maxH * currentAR;
            } else {
                ch = maxW / currentAR;
            }
            cw = cw * (DEFAULT_CROP_PERCENT / PERCENT_SCALE);
            ch = ch * (DEFAULT_CROP_PERCENT / PERCENT_SCALE);
            
            setCropX((maxW - cw) / 2);
            setCropY((maxH - ch) / 2);
        }
    };
    
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!displayDimensions || !image) return;
        
        e.preventDefault();
        setIsDragging(true);
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startBoxX = clampedCropX;
        const startBoxY = clampedCropY;
        const scaleVal = displayDimensions.width / (image.width || 1);
        
        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = (moveEvent.clientX - startX) / scaleVal;
            const deltaY = (moveEvent.clientY - startY) / scaleVal;
            
            let newX = startBoxX + deltaX;
            let newY = startBoxY + deltaY;
            
            // Clamp to boundaries
            newX = Math.max(0, Math.min(newX, (image.width || 1) - originalCropW));
            newY = Math.max(0, Math.min(newY, (image.height || 1) - originalCropH));
            
            setCropX(newX);
            setCropY(newY);
        };
        
        const handleMouseUp = () => {
            setIsDragging(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };
    
    const handleSave = async () => {
        if (!image) return;
        
        const finalX = Math.round(clampedCropX);
        const finalY = Math.round(clampedCropY);
        const finalW = Math.round(originalCropW);
        const finalH = Math.round(originalCropH);
        
        try {
            const res = await mutateAsync({
                imageId: image.id,
                data: {
                    aspect_ratio: aspectRatio,
                    x: finalX,
                    y: finalY,
                    width: finalW,
                    height: finalH,
                    save_mode: saveMode as 'new' | 'replace',
                    preview_only: false
                }
            });
            
            notifications.show({
                title: 'Success',
                message: saveMode === 'replace' ? 'Original image successfully replaced.' : 'Cropped image saved as new wallpaper.',
                color: 'green'
            });
            
            if (res.image) {
                onCropSuccess?.(res.image as ImageModel);
            }
            onClose();
        } catch (err) {
            notifications.show({
                title: 'Error',
                message: 'Failed to crop image. Please check backend logs.',
                color: 'red'
            });
            console.error(err);
        }
    };
    
    if (!image) return null;
    
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            size="85%"
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
                                        <Box style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255,255,255,0.4)', boxSizing: 'border-box' }} />
                                        <Box style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255,255,255,0.4)', boxSizing: 'border-box' }} />
                                        <Box style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: '1px', borderLeft: '1px dashed rgba(255,255,255,0.4)', boxSizing: 'border-box' }} />
                                        <Box style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: '1px', borderLeft: '1px dashed rgba(255,255,255,0.4)', boxSizing: 'border-box' }} />
                                        
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
                
                {/* Control Panel Panel */}
                <Stack style={{ width: '280px', flexShrink: 0 }} justify="space-between">
                    <Stack gap="md">
                        <Box>
                            <Text size="sm" fw={600} mb="xs">Aspect Ratio</Text>
                            <Select
                                value={aspectRatio}
                                onChange={(val) => {
                                    if (!val) return;
                                    setAspectRatio(val);
                                    if (val === 'custom' && image) {
                                        setCustomWidth(DEFAULT_CROP_PERCENT);
                                        setCustomHeight(DEFAULT_CROP_PERCENT);
                                        setCropX((image.width || 1) * DEFAULT_CUSTOM_CROP_OFFSET_RATIO);
                                        setCropY((image.height || 1) * DEFAULT_CUSTOM_CROP_OFFSET_RATIO);
                                    }
                                }}
                                comboboxProps={{ zIndex: 4000, portalProps: { zIndex: 4000 } } as ComboboxProps}
                                data={[
                                    { value: '16:9', label: '16:9 (Standard Horizontal)' },
                                    { value: '21:9', label: '21:9 (Ultrawide)' },
                                    { value: '16:10', label: '16:10 (Monitor)' },
                                    { value: '9:16', label: '9:16 (Vertical/Mobile)' },
                                    { value: 'custom', label: 'Custom (Free Crop)' }
                                ]}
                            />
                        </Box>
                        
                        {aspectRatio === 'custom' ? (
                            <>
                                <Box>
                                    <Group justify="space-between" mb="xs">
                                        <Text size="sm" fw={600}>Crop Width</Text>
                                        <Text size="xs" c="dimmed">{customWidth}%</Text>
                                    </Group>
                                    <Slider
                                        value={customWidth}
                                        onChange={setCustomWidth}
                                        min={MIN_CROP_PERCENT}
                                        max={MAX_CROP_PERCENT}
                                        step={1}
                                        label={(value) => `${value}%`}
                                    />
                                </Box>
                                <Box>
                                    <Group justify="space-between" mb="xs">
                                        <Text size="sm" fw={600}>Crop Height</Text>
                                        <Text size="xs" c="dimmed">{customHeight}%</Text>
                                    </Group>
                                    <Slider
                                        value={customHeight}
                                        onChange={setCustomHeight}
                                        min={MIN_CROP_PERCENT}
                                        max={MAX_CROP_PERCENT}
                                        step={1}
                                        label={(value) => `${value}%`}
                                    />
                                </Box>
                            </>
                        ) : (
                            <Box>
                                <Group justify="space-between" mb="xs">
                                    <Text size="sm" fw={600}>Crop Size</Text>
                                    <Text size="xs" c="dimmed">{cropSize}%</Text>
                                </Group>
                                <Slider
                                    value={cropSize}
                                    onChange={setCropSize}
                                    min={MIN_CROP_PERCENT}
                                    max={MAX_CROP_PERCENT}
                                    step={1}
                                    label={(value) => `${value}%`}
                                />
                            </Box>
                        )}
                        
                        <Box>
                            <Text size="sm" fw={600} mb="xs">Saving Method</Text>
                            <SegmentedControl
                                value={saveMode}
                                onChange={(val) => val && setSaveMode(val)}
                                fullWidth
                                data={[
                                    { label: 'Save as New', value: 'new' },
                                    { label: 'Replace Original', value: 'replace' }
                                ]}
                            />
                            <Text size="xs" c="dimmed" mt="xs">
                                {saveMode === 'new' 
                                    ? 'Creates a new visual wallpaper copy inside the set, preserving the original.'
                                    : 'Overwrites the original image file directly. Warning: this cannot be undone.'
                                }
                            </Text>
                        </Box>
                        
                        {displayDimensions && (
                            <Box style={{ backgroundColor: 'var(--mantine-color-gray-0)', padding: '10px', borderRadius: '4px', border: '1px solid var(--mantine-color-gray-2)' }}>
                                <Text size="xs" fw={600} mb={4}>Output Crop Stats:</Text>
                                <Text size="xs" c="dimmed">
                                    Source Resolution: {image.width} x {image.height}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Crop Target: {Math.round(originalCropW)} x {Math.round(originalCropH)}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    X Offset: {Math.round(clampedCropX)}px, Y Offset: {Math.round(clampedCropY)}px
                                </Text>
                            </Box>
                        )}
                    </Stack>
                    
                    <Group gap="sm" grow>
                        <Button variant="outline" color="gray" leftSection={<IconX size={16} />} onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            color="blue"
                            leftSection={<IconCrop size={16} />}
                            loading={isPending}
                            onClick={handleSave}
                        >
                            Apply Crop
                        </Button>
                    </Group>
                </Stack>
            </Box>
        </Modal>
    );
}
