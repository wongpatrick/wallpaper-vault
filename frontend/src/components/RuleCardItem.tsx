/**
 * @file
 * Module: Rule Card Item
 * Description: Draggable card representing a single scheduled rotation override rule.
 */
import React from 'react';
import { Card, Group, Stack, Text, Badge, Divider, Switch, ActionIcon } from '@mantine/core';
import {
    IconGripVertical, IconPencil, IconTrash, IconArrowUp, IconArrowDown
} from '@tabler/icons-react';
import { type RotationRule, formatDays } from '../types/rotation';

interface RuleCardItemProps {
    rule: RotationRule;
    index: number;
    isCurrentlyActive: boolean;
    isDraggingOver: boolean;
    playlistName?: string;
    isFirst: boolean;
    isLast: boolean;
    onDragStart: (e: React.DragEvent, index: number) => void;
    onDragOver: (e: React.DragEvent, index: number) => void;
    onDrop: (e: React.DragEvent, index: number) => void;
    onToggleEnabled: (rule: RotationRule, checked: boolean) => void;
    onEdit: (rule: RotationRule) => void;
    onDelete: (ruleId: number) => void;
    onMove: (index: number, direction: 'up' | 'down') => void;
}

export function RuleCardItem({
    rule,
    index,
    isCurrentlyActive,
    isDraggingOver,
    playlistName = 'Unknown',
    isFirst,
    isLast,
    onDragStart,
    onDragOver,
    onDrop,
    onToggleEnabled,
    onEdit,
    onDelete,
    onMove
}: RuleCardItemProps) {
    return (
        <Card
            key={rule.id}
            withBorder
            radius="md"
            p="md"
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={(e) => onDrop(e, index)}
            style={{
                borderStyle: isDraggingOver ? 'dashed' : 'solid',
                borderWidth: isDraggingOver ? '2px' : '1px',
                borderColor: isCurrentlyActive ? 'var(--mantine-color-green-filled)' : isDraggingOver ? 'var(--mantine-color-blue-filled)' : undefined,
                cursor: 'grab'
            }}
        >
            <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" style={{ flexGrow: 1 }}>
                    <div style={{ color: 'var(--mantine-color-gray-5)', display: 'flex', alignItems: 'center' }}>
                        <IconGripVertical size="1.2rem" />
                    </div>
                    <Stack gap="xs" style={{ flexGrow: 1 }}>
                        <Group gap="xs" wrap="nowrap">
                            <Text ff="Inter" size="sm" fw={600} style={{ textDecoration: rule.enabled === 0 ? 'line-through' : 'none' }}>
                                {rule.name}
                            </Text>
                            {isCurrentlyActive && <Badge color="green" variant="filled">Active</Badge>}
                            {rule.enabled === 0 && <Badge color="gray">Disabled</Badge>}
                        </Group>
                        <Group gap="xs" wrap="nowrap" c="dimmed">
                            <Text size="xs">
                                📅 {rule.start_date && rule.end_date ? `${rule.start_date} to ${rule.end_date}` : 'All Year'}
                            </Text>
                            <Divider orientation="vertical" />
                            <Text size="xs">
                                📆 {formatDays(rule.days_of_week)}
                            </Text>
                            <Divider orientation="vertical" />
                            <Text size="xs">
                                🕒 {rule.start_time && rule.end_time ? `${rule.start_time} - ${rule.end_time}` : 'All Day'}
                            </Text>
                        </Group>
                        <Group gap="xs" wrap="nowrap">
                            <Badge color="blue" variant="light" size="xs">
                                Source: {rule.source === 'playlist' ? `Playlist: ${playlistName}` : 'Entire Library'}
                            </Badge>
                            <Badge color="violet" variant="light" size="xs">
                                Style: {rule.style || 'fill'}
                            </Badge>
                        </Group>
                    </Stack>
                </Group>

                <Group gap="xs">
                    <Switch
                        checked={rule.enabled === 1}
                        onChange={(e) => onToggleEnabled(rule, e.currentTarget.checked)}
                        size="sm"
                    />
                    <Divider orientation="vertical" />
                    <ActionIcon variant="light" color="blue" onClick={() => onEdit(rule)}>
                        <IconPencil size="1rem" />
                    </ActionIcon>
                    <ActionIcon variant="light" color="red" onClick={() => onDelete(rule.id)}>
                        <IconTrash size="1rem" />
                    </ActionIcon>
                    <Divider orientation="vertical" />
                    <ActionIcon variant="transparent" disabled={isFirst} onClick={() => onMove(index, 'up')}>
                        <IconArrowUp size="1rem" />
                    </ActionIcon>
                    <ActionIcon variant="transparent" disabled={isLast} onClick={() => onMove(index, 'down')}>
                        <IconArrowDown size="1rem" />
                    </ActionIcon>
                </Group>
            </Group>
        </Card>
    );
}
