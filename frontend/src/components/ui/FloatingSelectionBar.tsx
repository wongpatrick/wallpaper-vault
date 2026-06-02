/**
 * @file
 * Module: Floating Selection Bar
 * Description: Reusable component to show a floating bar for bulk actions when items are selected.
 */
import { Paper, Group, ActionIcon, Text, Transition } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';

interface FloatingSelectionBarProps {
    mounted: boolean;
    selectedCount: number;
    onClear: () => void;
    children?: ReactNode;
    itemLabel?: string;
    minWidth?: number | string;
}

const DEFAULT_MIN_WIDTH = 400;

export function FloatingSelectionBar({ 
    mounted,
    selectedCount, 
    onClear, 
    children, 
    itemLabel = "items",
    minWidth = DEFAULT_MIN_WIDTH 
}: FloatingSelectionBarProps) {
    return (
        <Transition mounted={mounted} transition="slide-up" duration={400} timingFunction="ease">
            {(styles) => (
                <Paper 
                    shadow="xl" 
                    p="md" 
                    withBorder 
                    style={{ 
                        ...styles,
                        position: 'fixed', 
                        bottom: 20, 
                        left: '50%', 
                        transform: 'translateX(-50%)',
                        zIndex: 100,
                        borderRadius: 100,
                        backgroundColor: 'var(--mantine-color-body)',
                        width: 'auto',
                        minWidth
                    }}
                >
                    <Group justify="space-between" wrap="nowrap" gap="xl">
                        <Group gap="sm">
                            <ActionIcon variant="subtle" color="gray" onClick={onClear} radius="xl">
                                <IconX size={18} />
                            </ActionIcon>
                            <Text fw={600} size="sm">
                                {selectedCount} {itemLabel} selected
                            </Text>
                        </Group>

                        <Group gap="xs">
                            {children}
                        </Group>
                    </Group>
                </Paper>
            )}
        </Transition>
    );
}
