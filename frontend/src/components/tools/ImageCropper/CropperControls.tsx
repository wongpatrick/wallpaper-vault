import { Paper, Stack, Group, Text, SegmentedControl, NumberInput } from '@mantine/core';
import { IconAspectRatio, IconSettings } from '@tabler/icons-react';
import type { AspectRatio } from './useImageCropper';

interface CropperControlsProps {
    aspectRatio: AspectRatio;
    setAspectRatio: (val: AspectRatio) => void;
    customRatio: { w: number; h: number };
    setCustomRatio: (val: (prev: { w: number; h: number }) => { w: number; h: number }) => void;
}

export function CropperControls({ aspectRatio, setAspectRatio, customRatio, setCustomRatio }: CropperControlsProps) {
    return (
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
    );
}
