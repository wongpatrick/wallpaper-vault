/**
 * @file ColorExplorer.tsx
 * @description Component for exploring the vault by dominant color stats.
 */
import { Group, Stack, Text, ColorSwatch, Center, Loader, ActionIcon, Tooltip, Box, Popover, ColorPicker, Slider, Divider } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useReadColorStatsApiImagesColorStatsGet } from '../../api/generated/images/images';
import { useMemo, useState, useEffect } from 'react';

const PRESET_SWATCHES = [
    '#E03131', '#E8590C', '#F08C00', '#2F9E44', '#0C8599',
    '#1971C2', '#6741D9', '#C2255C', '#F8F9FA', '#868E96', '#212529',
];

interface ColorExplorerProps {
    activeColor?: string;
    onColorSelect: (color: string) => void;
    onColorPickerChange: (color: string) => void;
    onClearColor: () => void;
    tolerance: number;
    onToleranceChange: (value: number) => void;
}

export function ColorExplorer({ activeColor, onColorSelect, onColorPickerChange, onClearColor, tolerance, onToleranceChange }: ColorExplorerProps) {
    const { data: stats, isLoading } = useReadColorStatsApiImagesColorStatsGet({ tolerance });
    
    // Local state for smooth sliding before committing
    const [localTolerance, setLocalTolerance] = useState(tolerance);

    // Sync local state when parent prop changes
    useEffect(() => {
        setLocalTolerance(tolerance);
    }, [tolerance]);

    // Create a map of color -> count
    const statsMap = useMemo(() => {
        const map = new Map<string, number>();
        if (stats) {
            stats.forEach((stat: Record<string, unknown>) => {
                const color = String(stat.color);
                const count = Number(stat.count);
                map.set(color.toUpperCase(), count);
            });
        }
        return map;
    }, [stats]);

    return (
        <Box p="md" style={{ borderRadius: 'var(--mantine-radius-md)', backgroundColor: 'var(--mantine-color-default)' }}>
            <Stack gap="md">
                <Text size="sm" fw={700} c="dimmed" ta="center">Explore your vault by dominant color</Text>
                
                {isLoading ? (
                    <Center p="xl"><Loader size="md" variant="dots" /></Center>
                ) : (
                    <Group gap="md" justify="center">
                        {/* Invisible spacer to perfectly balance the custom picker on the right */}
                        <Box w={activeColor ? 100 : 66} display={{ base: 'none', md: 'block' }} />
                        {PRESET_SWATCHES.map((color) => {
                            const upperColor = color.toUpperCase();
                            const count = statsMap.get(upperColor) || 0;
                            const isActive = activeColor?.toUpperCase() === upperColor;

                            return (
                                <Tooltip key={color} label={`${count} images`} position="top" withArrow>
                                    <Stack gap={4} align="center">
                                        <ActionIcon
                                            size={60}
                                            radius="xl"
                                            variant="transparent"
                                            onClick={() => onColorSelect(color)}
                                            style={{
                                                transition: 'transform 0.2s ease',
                                                transform: isActive ? 'scale(1.1)' : 'scale(1)',
                                            }}
                                        >
                                            <ColorSwatch 
                                                color={color} 
                                                size={50}
                                                style={{ 
                                                    cursor: 'pointer',
                                                    border: isActive ? '2px solid var(--mantine-color-blue-filled)' : '1px solid var(--mantine-color-default-border)',
                                                    boxShadow: isActive ? 'var(--mantine-shadow-md)' : 'none'
                                                }}
                                            >
                                                {isActive && (
                                                    <IconCheck 
                                                        size={24} 
                                                        color={color === '#F8F9FA' ? 'black' : 'white'} 
                                                    />
                                                )}
                                            </ColorSwatch>
                                        </ActionIcon>
                                        <Text size="xs" c="dimmed" fw={500}>{count}</Text>
                                    </Stack>
                                </Tooltip>
                            );
                        })}
                        
                        <Divider orientation="vertical" />

                        <Popover position="bottom" shadow="lg" radius="md" withinPortal>
                            <Popover.Target>
                                <Tooltip label={activeColor ? 'Change color filter' : 'Filter by custom color'} position="bottom" withArrow>
                                    <ActionIcon
                                        size={50}
                                        radius="xl"
                                        variant="default"
                                        aria-label="Open color picker"
                                        style={{
                                            background: activeColor
                                                ? activeColor
                                                : 'conic-gradient(#E03131, #E8590C, #F08C00, #2F9E44, #0C8599, #1971C2, #6741D9, #C2255C, #E03131)',
                                            border: '1px solid var(--mantine-color-default-border)',
                                            cursor: 'pointer',
                                            alignSelf: 'center',
                                            marginBottom: 16 // align with the swatches visually
                                        }}
                                    />
                                </Tooltip>
                            </Popover.Target>
                            <Popover.Dropdown p="sm">
                                <ColorPicker
                                    format="hex"
                                    value={activeColor || '#1971C2'}
                                    onChange={onColorPickerChange}
                                    swatches={PRESET_SWATCHES}
                                    swatchesPerRow={6}
                                />
                            </Popover.Dropdown>
                        </Popover>

                        {activeColor && (
                            <Tooltip label="Clear color filter" position="bottom" withArrow>
                                <ActionIcon
                                    size="md"
                                    radius="xl"
                                    variant="subtle"
                                    color="gray"
                                    onClick={onClearColor}
                                    aria-label="Clear color filter"
                                    style={{ alignSelf: 'center', marginBottom: 16 }}
                                >
                                    <IconX size={20} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                )}
                
                <Box mt="md" px="xl" pb="xl" mx="auto" w="100%" maw={820}>
                    <Group justify="space-between" mb={8}>
                        <Text size="sm" fw={500} c="dimmed">Color Match Strictness</Text>
                        <Text size="xs" c="dimmed">{localTolerance}°</Text>
                    </Group>
                    <Slider
                        value={localTolerance}
                        onChange={setLocalTolerance}
                        onChangeEnd={onToleranceChange}
                        min={0}
                        max={60}
                        step={1}
                        marks={[
                            { value: 0, label: 'Strict' },
                            { value: 30, label: 'Default' },
                            { value: 60, label: 'Loose' }
                        ]}
                        color="blue"
                    />
                </Box>
            </Stack>
        </Box>
    );
}
