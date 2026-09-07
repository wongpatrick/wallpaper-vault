/**
 * @file
 * Component: Rotation Rules Manager
 * Description: Interface to create, edit, reorder, and configure scheduled override rules.
 */
import React, { useState, useEffect } from 'react';
import {
    Stack, Group, Text, Button, Paper, Alert, SegmentedControl
} from '@mantine/core';
import { RotationRulesCalendar } from './RotationRulesCalendar';
import { IconPlus, IconClock } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { AXIOS_INSTANCE } from '../api/axios-instance';
import { RuleCardItem } from './RuleCardItem';
import { RuleEditModal } from './RuleEditModal';
import type { RotationRule, PlaylistOption, RuleFormData } from '../types/rotation';

const PRIORITY_STEP = 10;

export function RotationRulesManager() {
    const [rules, setRules] = useState<RotationRule[]>([]);
    const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
    const [activeRule, setActiveRule] = useState<RotationRule | null>(null);

    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<RotationRule | null>(null);
    const [initialDatePreset, setInitialDatePreset] = useState<string | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const loadData = async () => {
        try {
            const [rulesRes, playlistsRes, activeRes] = await Promise.all([
                AXIOS_INSTANCE.get<RotationRule[]>('/api/rotation-rules/'),
                AXIOS_INSTANCE.get<PlaylistOption[]>('/api/playlists'),
                AXIOS_INSTANCE.get<RotationRule | null>('/api/rotation-rules/active')
            ]);
            setRules(rulesRes.data);
            setPlaylists(playlistsRes.data);
            setActiveRule(activeRes.data);
        } catch (error) {
            console.error('Failed to load rotation rules', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to load rotation rules and playlists',
                color: 'red'
            });
        }
    };

    useEffect(() => {
        let active = true;
        const fetchRules = async () => {
            try {
                const [rulesRes, playlistsRes, activeRes] = await Promise.all([
                    AXIOS_INSTANCE.get<RotationRule[]>('/api/rotation-rules/'),
                    AXIOS_INSTANCE.get<PlaylistOption[]>('/api/playlists'),
                    AXIOS_INSTANCE.get<RotationRule | null>('/api/rotation-rules/active')
                ]);
                if (active) {
                    setRules(rulesRes.data);
                    setPlaylists(playlistsRes.data);
                    setActiveRule(activeRes.data);
                }
            } catch (error) {
                console.error('Failed to load rotation rules', error);
                notifications.show({
                    title: 'Error',
                    message: 'Failed to load rotation rules and playlists',
                    color: 'red'
                });
            }
        };
        fetchRules();
        return () => {
            active = false;
        };
    }, []);

    const openCreateModal = () => {
        setEditingRule(null);
        setInitialDatePreset(null);
        setModalOpen(true);
    };

    const handleAddRuleForDate = (date: Date) => {
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        setEditingRule(null);
        setInitialDatePreset(`${m}-${d}`);
        setModalOpen(true);
    };

    const openEditModal = (rule: RotationRule) => {
        setEditingRule(rule);
        setInitialDatePreset(null);
        setModalOpen(true);
    };

    const handleSaveRule = async (formData: RuleFormData) => {
        try {
            if (editingRule) {
                await AXIOS_INSTANCE.patch(`/api/rotation-rules/${editingRule.id}`, formData);
                notifications.show({
                    title: 'Success',
                    message: 'Rule updated successfully',
                    color: 'green'
                });
            } else {
                const maxPriority = rules.length > 0 ? Math.max(...rules.map(r => r.priority)) : 0;
                await AXIOS_INSTANCE.post('/api/rotation-rules/', {
                    ...formData,
                    priority: maxPriority + PRIORITY_STEP
                });
                notifications.show({
                    title: 'Success',
                    message: 'Rule created successfully',
                    color: 'green'
                });
            }
            setModalOpen(false);
            loadData();
        } catch (error) {
            console.error('Failed to save rule', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to save rule',
                color: 'red'
            });
        }
    };

    const handleDeleteRule = async (ruleId: number) => {
        try {
            await AXIOS_INSTANCE.delete(`/api/rotation-rules/${ruleId}`);
            notifications.show({
                title: 'Success',
                message: 'Rule deleted successfully',
                color: 'green'
            });
            loadData();
        } catch (error) {
            console.error('Failed to delete rule', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to delete rule',
                color: 'red'
            });
        }
    };

    const handleToggleEnabled = async (rule: RotationRule, checked: boolean) => {
        try {
            await AXIOS_INSTANCE.patch(`/api/rotation-rules/${rule.id}`, {
                enabled: checked ? 1 : 0
            });
            setRules(rules.map(r => r.id === rule.id ? { ...r, enabled: checked ? 1 : 0 } : r));
            const activeRes = await AXIOS_INSTANCE.get<RotationRule | null>('/api/rotation-rules/active');
            setActiveRule(activeRes.data);
        } catch (error) {
            console.error('Failed to toggle rule', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to toggle rule state',
                color: 'red'
            });
        }
    };

    const updatePriorities = async (reorderedRules: RotationRule[]) => {
        try {
            const count = reorderedRules.length;
            const updates = reorderedRules.map((r, idx) => ({
                id: r.id,
                priority: (count - idx) * PRIORITY_STEP
            }));
            await AXIOS_INSTANCE.put('/api/rotation-rules/priorities', updates);
            loadData();
        } catch (error) {
            console.error('Failed to update rule priorities', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to update rule order',
                color: 'red'
            });
        }
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        setDragOverIndex(null);
        const dragIndexStr = e.dataTransfer.getData('text/plain');
        if (!dragIndexStr) return;
        const dragIndex = parseInt(dragIndexStr, 10);
        if (dragIndex === dropIndex) return;

        const newRules = [...rules];
        const [draggedRule] = newRules.splice(dragIndex, 1);
        newRules.splice(dropIndex, 0, draggedRule);
        
        setRules(newRules);
        updatePriorities(newRules);
    };

    const moveRule = (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= rules.length) return;

        const newRules = [...rules];
        const [movedRule] = newRules.splice(index, 1);
        newRules.splice(targetIndex, 0, movedRule);
        
        setRules(newRules);
        updatePriorities(newRules);
    };

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Text size="sm" c="dimmed">
                    Define scheduled rules to override the global rotation source, playlist, and wallpaper fit style during specific dates, days, or time windows. Rules are evaluated in descending priority order.
                </Text>
                <Group gap="md">
                    <SegmentedControl
                        value={viewMode}
                        onChange={(val) => setViewMode(val as 'list' | 'calendar')}
                        data={[
                            { label: 'List View', value: 'list' },
                            { label: 'Calendar View', value: 'calendar' }
                        ]}
                    />
                    <Button leftSection={<IconPlus size="1rem" />} color="blue" onClick={openCreateModal}>
                        Add Rule
                    </Button>
                </Group>
            </Group>

            {activeRule && (
                <Alert icon={<IconClock size="1rem" />} title="Currently Active Override Rule" color="green" variant="light">
                    The rule <strong>{activeRule.name}</strong> is currently active and overriding rotation configuration settings.
                </Alert>
            )}

            {viewMode === 'calendar' ? (
                <RotationRulesCalendar rules={rules} playlists={playlists} onAddRuleForDate={handleAddRuleForDate} />
            ) : rules.length === 0 ? (
                <Paper withBorder p="xl" radius="md" style={{ textAlign: 'center' }}>
                    <Text c="dimmed" size="sm">No scheduled rules defined yet. Create your first rule to override rotation settings!</Text>
                </Paper>
            ) : (
                <Stack gap="xs">
                    {rules.map((rule, index) => (
                        <RuleCardItem
                            key={rule.id}
                            rule={rule}
                            index={index}
                            isCurrentlyActive={activeRule?.id === rule.id}
                            isDraggingOver={dragOverIndex === index}
                            playlistName={playlists.find(p => p.id === rule.playlist_id)?.name}
                            isFirst={index === 0}
                            isLast={index === rules.length - 1}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onToggleEnabled={handleToggleEnabled}
                            onEdit={openEditModal}
                            onDelete={handleDeleteRule}
                            onMove={moveRule}
                        />
                    ))}
                </Stack>
            )}

            <RuleEditModal
                opened={modalOpen}
                onClose={() => setModalOpen(false)}
                rule={editingRule}
                initialDatePreset={initialDatePreset}
                playlists={playlists}
                onSave={handleSaveRule}
            />
        </Stack>
    );
}
