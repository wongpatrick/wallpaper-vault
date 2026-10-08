/**
 * @file
 * Module: ImageCropControls Component
 * Description: Side control panel for ImageCropModal providing aspect ratio selectors, sliders, save modes, stats, and action buttons.
 */
import { Stack, Box, Text, Select, Slider, Group, SegmentedControl, Button } from '@mantine/core';
import type { ComboboxProps } from '@mantine/core';
import { IconX, IconCrop } from '@tabler/icons-react';
import type { Image as ImageModel } from '../../../api/model';

const MIN_CROP_PERCENT = 20;
const MAX_CROP_PERCENT = 100;

export interface ImageCropControlsProps {
    image: ImageModel;
    aspectRatio: string;
    onAspectRatioChange: (val: string) => void;
    saveMode: string;
    onSaveModeChange: (val: string) => void;
    cropSize: number;
    onCropSizeChange: (val: number) => void;
    customWidth: number;
    onCustomWidthChange: (val: number) => void;
    customHeight: number;
    onCustomHeightChange: (val: number) => void;
    displayDimensions: { width: number; height: number } | null;
    originalCropW: number;
    originalCropH: number;
    clampedCropX: number;
    clampedCropY: number;
    isPending: boolean;
    onClose: () => void;
    onSave: () => void;
}

export function ImageCropControls({
    image,
    aspectRatio,
    onAspectRatioChange,
    saveMode,
    onSaveModeChange,
    cropSize,
    onCropSizeChange,
    customWidth,
    onCustomWidthChange,
    customHeight,
    onCustomHeightChange,
    displayDimensions,
    originalCropW,
    originalCropH,
    clampedCropX,
    clampedCropY,
    isPending,
    onClose,
    onSave
}: ImageCropControlsProps) {
    return (
        <Stack style={{ width: '280px', flexShrink: 0 }} justify="space-between">
            <Stack gap="md">
                <Box>
                    <Text size="sm" fw={600} mb="xs">Aspect Ratio</Text>
                    <Select
                        value={aspectRatio}
                        onChange={(val) => {
                            if (val) onAspectRatioChange(val);
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
                                onChange={onCustomWidthChange}
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
                                onChange={onCustomHeightChange}
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
                            onChange={onCropSizeChange}
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
                        onChange={(val) => val && onSaveModeChange(val)}
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
                    onClick={onSave}
                >
                    Apply Crop
                </Button>
            </Group>
        </Stack>
    );
}
