import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, Group, Stack, Text, Button, Paper, Box, SegmentedControl, NumberInput, ThemeIcon } from '@mantine/core';
import { IconCrop, IconUpload, IconX, IconDownload, IconAspectRatio, IconSettings } from '@tabler/icons-react';

type AspectRatio = 'free' | '16:9' | '16:10' | '9:16' | '4:3' | '1:1' | 'custom';

export function ImageCropper() {
    const [image, setImage] = useState<string | null>(null);
    const [croppedImage, setCroppedImage] = useState<string | null>(null);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
    const [customRatio, setCustomRatio] = useState({ w: 21, h: 9 });
    const [crop, setCrop] = useState({ x: 50, y: 50, width: 320, height: 180 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [initialCrop, setInitialCrop] = useState({ x: 0, y: 0, width: 0, height: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => setImage(event.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => setImage(event.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    useEffect(() => {
        if (!imageRef.current) return;
        const img = imageRef.current;
        const containerWidth = img.clientWidth;
        const containerHeight = img.clientHeight;

        let width = containerWidth * 0.8;
        let height = containerHeight * 0.8;

        if (aspectRatio !== 'free') {
            let ratio = 1;
            if (aspectRatio === 'custom') {
                ratio = (customRatio.w || 1) / (customRatio.h || 1);
            } else {
                const [w, h] = aspectRatio.split(':').map(Number);
                ratio = w / (h || 1);
            }

            if (width / height > ratio) {
                width = height * ratio;
            } else {
                height = width / ratio;
            }
        }

        setCrop({
            x: (containerWidth - width) / 2,
            y: (containerHeight - height) / 2,
            width,
            height
        });
    }, [aspectRatio, image, customRatio]);

    const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'resize') => {
        e.preventDefault();
        setIsDragging(type === 'move');
        setIsResizing(type === 'resize');
        setDragStart({ x: e.clientX, y: e.clientY });
        setInitialCrop({ ...crop });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging && !isResizing) return;
        if (!imageRef.current) return;

        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;
        const img = imageRef.current;

        if (isDragging) {
            setCrop(prev => ({
                ...prev,
                x: Math.max(0, Math.min(img.clientWidth - prev.width, initialCrop.x + deltaX)),
                y: Math.max(0, Math.min(img.clientHeight - prev.height, initialCrop.y + deltaY))
            }));
        } else if (isResizing) {
            let newWidth = Math.max(50, initialCrop.width + deltaX);
            let newHeight = Math.max(50, initialCrop.height + deltaY);

            if (aspectRatio !== 'free') {
                let ratio = 1;
                if (aspectRatio === 'custom') {
                    ratio = (customRatio.w || 1) / (customRatio.h || 1);
                } else {
                    const [w, h] = aspectRatio.split(':').map(Number);
                    ratio = w / (h || 1);
                }

                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    newHeight = newWidth / ratio;
                } else {
                    newWidth = newHeight * ratio;
                }
            }

            if (initialCrop.x + newWidth > img.clientWidth) {
                newWidth = img.clientWidth - initialCrop.x;
                if (aspectRatio !== 'free') {
                    let ratio = 1;
                    if (aspectRatio === 'custom') {
                        ratio = (customRatio.w || 1) / (customRatio.h || 1);
                    } else {
                        const [w, h] = aspectRatio.split(':').map(Number);
                        ratio = w / (h || 1);
                    }
                    newHeight = newWidth / ratio;
                }
            }
            if (initialCrop.y + newHeight > img.clientHeight) {
                newHeight = img.clientHeight - initialCrop.y;
                if (aspectRatio !== 'free') {
                    let ratio = 1;
                    if (aspectRatio === 'custom') {
                        ratio = (customRatio.w || 1) / (customRatio.h || 1);
                    } else {
                        const [w, h] = aspectRatio.split(':').map(Number);
                        ratio = w / (h || 1);
                    }
                    newWidth = newHeight * ratio;
                }
            }

            setCrop(prev => ({ ...prev, width: newWidth, height: newHeight }));
        }
    }, [isDragging, isResizing, dragStart, initialCrop, aspectRatio, customRatio]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(false);
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const performCrop = () => {
        if (!imageRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = imageRef.current;
        const scaleX = img.naturalWidth / img.clientWidth;
        const scaleY = img.naturalHeight / img.clientHeight;

        canvas.width = crop.width * scaleX;
        canvas.height = crop.height * scaleY;

        ctx.drawImage(
            img,
            crop.x * scaleX,
            crop.y * scaleY,
            crop.width * scaleX,
            crop.height * scaleY,
            0,
            0,
            canvas.width,
            canvas.height
        );

        setCroppedImage(canvas.toDataURL('image/png'));
    };

    const downloadCropped = () => {
        if (!croppedImage) return;
        const link = document.createElement('a');
        link.download = `cropped-${Date.now()}.png`;
        link.href = croppedImage;
        link.click();
    };

    return (
        <Card shadow="sm" padding="xl" radius="md" withBorder>
            {!image ? (
                <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
                    <Paper 
                        withBorder p={60} radius="md" bg="var(--mantine-color-blue-light)"
                        style={{ borderStyle: 'dashed', borderWidth: 2, borderColor: 'var(--mantine-color-blue-4)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                        onClick={() => document.getElementById('fileInput')?.click()}
                    >
                        <input type="file" id="fileInput" hidden accept="image/*" onChange={handleFileSelect} />
                        <IconUpload size={48} stroke={1.5} color="var(--mantine-color-blue-6)" />
                        <Text fw={500} mt="md">Drop an image here</Text>
                        <Text size="sm" c="dimmed">to start cropping</Text>
                    </Paper>
                </div>
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

                        <Button variant="subtle" color="gray" leftSection={<IconX size={16} />} onClick={() => setImage(null)}>
                            Reset
                        </Button>
                    </Group>

                    <Paper withBorder p="xs" radius="md">
                        <Stack gap="sm">
                            <Group gap="sm">
                                <IconAspectRatio size={18} color="var(--mantine-color-gray-6)" />
                                <Text size="sm" fw={500}>Aspect Ratio:</Text>
                                <SegmentedControl 
                                    size="xs"
                                    value={aspectRatio}
                                    onChange={(val) => setAspectRatio(val as AspectRatio)}
                                    data={[
                                        { label: 'Free', value: 'free' },
                                        { label: '16:9', value: '16:9' },
                                        { label: '16:10', value: '16:10' },
                                        { label: '9:16', value: '9:16' },
                                        { label: '4:3', value: '4:3' },
                                        { label: '1:1', value: '1:1' },
                                        { label: 'Custom', value: 'custom' }
                                    ]}
                                />
                            </Group>
                            
                            {aspectRatio === 'custom' && (
                                <Group gap="xs" ml={30}>
                                    <IconSettings size={14} color="var(--mantine-color-gray-6)" />
                                    <NumberInput 
                                        size="xs" 
                                        placeholder="Width" 
                                        w={70} 
                                        min={1}
                                        value={customRatio.w}
                                        onChange={(val) => setCustomRatio(prev => ({ ...prev, w: Number(val) }))}
                                    />
                                    <Text size="xs">:</Text>
                                    <NumberInput 
                                        size="xs" 
                                        placeholder="Height" 
                                        w={70} 
                                        min={1}
                                        value={customRatio.h}
                                        onChange={(val) => setCustomRatio(prev => ({ ...prev, h: Number(val) }))}
                                    />
                                    <Text size="xs" c="dimmed">(e.g. 21 : 9)</Text>
                                </Group>
                            )}
                        </Stack>
                    </Paper>

                    <Group gap="xl" align="flex-start">
                        <Stack style={{ flex: 1 }} gap="md">
                            <Box 
                                ref={containerRef}
                                style={{ 
                                    position: 'relative', 
                                    backgroundColor: '#1a1a1a',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    minHeight: '400px'
                                }}
                            >
                                <div style={{ position: 'relative' }}>
                                    <img 
                                        ref={imageRef}
                                        src={image} 
                                        alt="To crop" 
                                        style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', userSelect: 'none' }} 
                                        onLoad={() => setAspectRatio(aspectRatio)}
                                    />
                                    
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
                                    
                                    <div 
                                        style={{
                                            position: 'absolute',
                                            top: `${crop.y}px`,
                                            left: `${crop.x}px`,
                                            width: `${crop.width}px`,
                                            height: `${crop.height}px`,
                                            border: '2px solid #fff',
                                            boxShadow: '0 0 0 9999px transparent',
                                            cursor: 'move',
                                            overflow: 'hidden'
                                        }}
                                        onMouseDown={(e) => handleMouseDown(e, 'move')}
                                    >
                                        <div style={{
                                            position: 'absolute',
                                            top: `-${crop.y}px`,
                                            left: `-${crop.x}px`,
                                            width: imageRef.current?.clientWidth,
                                            height: imageRef.current?.clientHeight,
                                            backgroundImage: `url(${image})`,
                                            backgroundSize: '100% 100%',
                                            pointerEvents: 'none'
                                        }} />
                                        
                                        <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)' }} />
                                        <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)' }} />
                                        <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)' }} />
                                        <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)' }} />

                                        <div 
                                            style={{
                                                position: 'absolute',
                                                right: 0,
                                                bottom: 0,
                                                width: '16px',
                                                height: '16px',
                                                backgroundColor: '#fff',
                                                cursor: 'nwse-resize',
                                                zIndex: 10
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                handleMouseDown(e, 'resize');
                                            }}
                                        />
                                    </div>
                                </div>
                            </Box>

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
                            <Stack gap="xs" style={{ width: 320 }}>
                                <Text fw={600} size="sm">Cropped Preview</Text>
                                <Paper withBorder p="xs" radius="md" bg="var(--mantine-color-gray-0)">
                                    <img src={croppedImage} alt="Cropped" style={{ width: '100%', display: 'block', borderRadius: '4px' }} />
                                    <Text size="xs" c="dimmed" mt="xs" ta="center">
                                        {Math.round(canvasRef.current?.width || 0)} x {Math.round(canvasRef.current?.height || 0)} px
                                    </Text>
                                </Paper>
                            </Stack>
                        )}
                    </Group>
                </Stack>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </Card>
    );
}
