/**
 * @file
 * Component: Rotation Rules Manager
 * Description: Interface to create, edit, reorder, and configure scheduled override rules.
 */
import React, { useState } from 'react';
import {
    Stack, Group, Text, Button, Paper, Alert, SegmentedControl, LoadingOverlay
} from '@mantine/core';
import { RotationRulesCalendar } from './RotationRulesCalendar';
import { IconPlus, IconClock, IconAlertCircle } from '@tabler/icons-react';
import { useAppNotifications } from '../hooks/useAppNotifications';
import { RuleCardItem } from './RuleCardItem';
import { RuleEditModal } from './RuleEditModal';
import { useRotationRules } from './useRotationRules';
import type { RotationRule } from '../api/model/rotationRule';
import type { RuleFormData } from '../types/rotation';

export function RotationRulesManager() {
    const { showNotification } = useAppNotifications();
    const {
        rules,
        activeRule,
        playlists,
        isLoading,
        error,
        createRule,
        updateRule,
        deleteRule,
        toggleRule,
        reorderRules
    } = useRotationRules();

    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<RotationRule | null>(null);
    const [initialDatePreset, setInitialDatePreset] = useState<string | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
                await updateRule(editingRule.id, formData);
                showNotification({
                    title: 'Success',
                    message: 'Rule updated successfully',
                    color: 'green'
                });
            } else {
                await createRule(formData);
                showNotification({
                    title: 'Success',
                    message: 'Rule created successfully',
                    color: 'green'
                });
            }
            setModalOpen(false);
        } catch (err) {
            console.error('Failed to save rule', err);
            showNotification({
                title: 'Error',
                message: 'Failed to save rule',
                color: 'red'
            });
        }
    };

    const handleDeleteRule = async (ruleId: number) => {
        try {
            await deleteRule(ruleId);
            showNotification({
                title: 'Success',
                message: 'Rule deleted successfully',
                color: 'green'
            });
        } catch (err) {
            console.error('Failed to delete rule', err);
            showNotification({
                title: 'Error',
                message: 'Failed to delete rule',
                color: 'red'
            });
        }
    };

    const handleToggleEnabled = async (rule: RotationRule, checked: boolean) => {
        try {
            await toggleRule(rule, checked);
        } catch (err) {
            console.error('Failed to toggle rule', err);
            showNotification({
                title: 'Error',
                message: 'Failed to toggle rule state',
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

    const handleDragEnd = () => {
        setDragOverIndex(null);
    };

    const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        setDragOverIndex(null);
        const dragIndexStr = e.dataTransfer.getData('text/plain');
        if (!dragIndexStr) return;
        const dragIndex = parseInt(dragIndexStr, 10);
        if (dragIndex === dropIndex) return;

        const newRules = [...rules];
        const [draggedRule] = newRules.splice(dragIndex, 1);
        newRules.splice(dropIndex, 0, draggedRule);

        try {
            await reorderRules(newRules);
        } catch (err) {
            console.error('Failed to update rule priorities', err);
            showNotification({
                title: 'Error',
                message: 'Failed to update rule order',
                color: 'red'
            });
        }
    };

    const moveRule = async (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= rules.length) return;

        const newRules = [...rules];
        const [movedRule] = newRules.splice(index, 1);
        newRules.splice(targetIndex, 0, movedRule);

        try {
            await reorderRules(newRules);
        } catch (err) {
            console.error('Failed to update rule priorities', err);
            showNotification({
                title: 'Error',
                message: 'Failed to update rule order',
                color: 'red'
            });
        }
    };

    return (
        <Stack gap="md" pos="relative">
            <LoadingOverlay visible={isLoading && rules.length === 0} overlayProps={{ blur: 1 }} />

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

            {error && (
                <Alert icon={<IconAlertCircle size="1rem" />} title="Error" color="red">
                    Failed to load rotation rules or playlists.
                </Alert>
            )}

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
                            onDragEnd={handleDragEnd}
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
