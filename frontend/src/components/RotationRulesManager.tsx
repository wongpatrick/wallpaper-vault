/**
 * @file
 * Component: Rotation Rules Manager
 * Description: Interface to create, edit, reorder, and configure scheduled override rules.
 */
import React, { useState, useEffect } from 'react';
import {
    Stack,
    Group,
    Text,
    Button,
    Card,
    Switch,
    Badge,
    ActionIcon,
    Modal,
    TextInput,
    Select,
    MultiSelect,
    Paper,
    Divider,
    Alert,
    SegmentedControl
} from '@mantine/core';
import { RotationRulesCalendar } from './RotationRulesCalendar';
import {
    IconPlus,
    IconTrash,
    IconPencil,
    IconArrowUp,
    IconArrowDown,
    IconClock,
    IconGripVertical
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { AXIOS_INSTANCE } from '../api/axios-instance';

interface Playlist {
    id: number;
    name: string;
    description?: string;
}

interface RotationRule {
    id: number;
    name: string;
    priority: number;
    enabled: number;
    start_date?: string; // MM-DD
    end_date?: string;   // MM-DD
    days_of_week?: string; // Comma separated (e.g. "1,2,3")
    start_time?: string; // HH:MM
    end_time?: string;   // HH:MM
    source: string; // "entire_library" or "playlist"
    playlist_id?: number;
    style?: string; // "fill", "fit", "stretch", "center", "span"
}

const DAYS = [
    { label: 'Monday', value: '1' },
    { label: 'Tuesday', value: '2' },
    { label: 'Wednesday', value: '3' },
    { label: 'Thursday', value: '4' },
    { label: 'Friday', value: '5' },
    { label: 'Saturday', value: '6' },
    { label: 'Sunday', value: '7' }
];

const MONTHS = [
    { label: 'Jan', value: '01' }, { label: 'Feb', value: '02' },
    { label: 'Mar', value: '03' }, { label: 'Apr', value: '04' },
    { label: 'May', value: '05' }, { label: 'Jun', value: '06' },
    { label: 'Jul', value: '07' }, { label: 'Aug', value: '08' },
    { label: 'Sep', value: '09' }, { label: 'Oct', value: '10' },
    { label: 'Nov', value: '11' }, { label: 'Dec', value: '12' }
];

const PRIORITY_STEP = 10;

export function RotationRulesManager() {
    const [rules, setRules] = useState<RotationRule[]>([]);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [activeRule, setActiveRule] = useState<RotationRule | null>(null);

    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [ruleName, setRuleName] = useState('');
    const [ruleEnabled, setRuleEnabled] = useState(true);
    const [ruleSource, setRuleSource] = useState<'entire_library' | 'playlist'>('entire_library');
    const [rulePlaylistId, setRulePlaylistId] = useState<string | null>(null);
    const [ruleStyle, setRuleStyle] = useState<string | null>('fill');
    
    // Conditions states
    const [selectedDays, setSelectedDays] = useState<string[]>([]);
    const [startMonth, setStartMonth] = useState<string | null>(null);
    const [startDay, setStartDay] = useState<string>('');
    const [endMonth, setEndMonth] = useState<string | null>(null);
    const [endDay, setEndDay] = useState<string>('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    
    const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const loadData = async () => {
        try {
            const [rulesRes, playlistsRes, activeRes] = await Promise.all([
                AXIOS_INSTANCE.get<RotationRule[]>('/api/rotation-rules/'),
                AXIOS_INSTANCE.get<Playlist[]>('/api/playlists'),
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
                    AXIOS_INSTANCE.get<Playlist[]>('/api/playlists'),
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
        setEditingRuleId(null);
        setRuleName('');
        setRuleEnabled(true);
        setRuleSource('entire_library');
        setRulePlaylistId(null);
        setRuleStyle('fill');
        setSelectedDays([]);
        setStartMonth(null);
        setStartDay('');
        setEndMonth(null);
        setEndDay('');
        setStartTime('');
        setEndTime('');
        setModalOpen(true);
    };

    const handleAddRuleForDate = (date: Date) => {
        setEditingRuleId(null);
        setRuleName('');
        setRuleEnabled(true);
        setRuleSource('entire_library');
        setRulePlaylistId(null);
        setRuleStyle('fill');
        setSelectedDays([]);
        
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        setStartMonth(m);
        setStartDay(d);
        setEndMonth(m);
        setEndDay(d);
        
        setStartTime('');
        setEndTime('');
        setModalOpen(true);
    };

    const openEditModal = (rule: RotationRule) => {
        setEditingRuleId(rule.id);
        setRuleName(rule.name);
        setRuleEnabled(rule.enabled === 1);
        setRuleSource(rule.source as 'entire_library' | 'playlist');
        setRulePlaylistId(rule.playlist_id ? String(rule.playlist_id) : null);
        setRuleStyle(rule.style || 'fill');
        setSelectedDays(rule.days_of_week ? rule.days_of_week.split(',') : []);
        
        if (rule.start_date) {
            const [m, d] = rule.start_date.split('-');
            setStartMonth(m);
            setStartDay(d);
        } else {
            setStartMonth(null);
            setStartDay('');
        }
        
        if (rule.end_date) {
            const [m, d] = rule.end_date.split('-');
            setEndMonth(m);
            setEndDay(d);
        } else {
            setEndMonth(null);
            setEndDay('');
        }
        
        setStartTime(rule.start_time || '');
        setEndTime(rule.end_time || '');
        setModalOpen(true);
    };

    const handleSaveRule = async () => {
        if (!ruleName.trim()) {
            notifications.show({ title: 'Validation Error', message: 'Rule name is required', color: 'red' });
            return;
        }

        if (ruleSource === 'playlist' && !rulePlaylistId) {
            notifications.show({ title: 'Validation Error', message: 'Please select a playlist', color: 'red' });
            return;
        }

        // Format dates
        let start_date: string | undefined = undefined;
        let end_date: string | undefined = undefined;
        if (startMonth && startDay) {
            const dayStr = startDay.padStart(2, '0');
            start_date = `${startMonth}-${dayStr}`;
        }
        if (endMonth && endDay) {
            const dayStr = endDay.padStart(2, '0');
            end_date = `${endMonth}-${dayStr}`;
        }

        const payload = {
            name: ruleName.trim(),
            enabled: ruleEnabled ? 1 : 0,
            source: ruleSource,
            playlist_id: ruleSource === 'playlist' ? Number(rulePlaylistId) : null,
            style: ruleStyle || 'fill',
            days_of_week: selectedDays.length > 0 ? selectedDays.join(',') : null,
            start_date: start_date || null,
            end_date: end_date || null,
            start_time: startTime || null,
            end_time: endTime || null,
            priority: editingRuleId ? undefined : (rules.length > 0 ? Math.max(...rules.map(r => r.priority)) + PRIORITY_STEP : PRIORITY_STEP)
        };

        try {
            if (editingRuleId) {
                await AXIOS_INSTANCE.put(`/api/rotation-rules/${editingRuleId}`, payload);
                notifications.show({ title: 'Success', message: 'Rule updated successfully', color: 'green' });
            } else {
                await AXIOS_INSTANCE.post('/api/rotation-rules/', payload);
                notifications.show({ title: 'Success', message: 'Rule created successfully', color: 'green' });
            }
            setModalOpen(false);
            loadData();
        } catch (error) {
            console.error('Failed to save rule', error);
            notifications.show({ title: 'Error', message: 'Failed to save rotation rule', color: 'red' });
        }
    };

    const handleDeleteRule = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this rule?')) return;
        try {
            await AXIOS_INSTANCE.delete(`/api/rotation-rules/${id}`);
            notifications.show({ title: 'Success', message: 'Rule deleted successfully', color: 'green' });
            loadData();
        } catch (error) {
            console.error('Failed to delete rule', error);
            notifications.show({ title: 'Error', message: 'Failed to delete rule', color: 'red' });
        }
    };

    const handleToggleEnabled = async (rule: RotationRule, val: boolean) => {
        try {
            await AXIOS_INSTANCE.put(`/api/rotation-rules/${rule.id}`, {
                enabled: val ? 1 : 0
            });
            loadData();
        } catch (error) {
            console.error('Failed to toggle rule', error);
            notifications.show({ title: 'Error', message: 'Failed to update rule state', color: 'red' });
        }
    };

    // Reorder rules by priorities
    const updatePriorities = async (reorderedRules: RotationRule[]) => {
        // High priority first, assigned descending based on list position
        try {
            const promises = reorderedRules.map((rule, idx) => {
                const priority = (reorderedRules.length - idx) * PRIORITY_STEP;
                return AXIOS_INSTANCE.put(`/api/rotation-rules/${rule.id}`, { priority });
            });
            await Promise.all(promises);
            loadData();
        } catch (error) {
            console.error('Failed to update priorities', error);
            notifications.show({ title: 'Error', message: 'Failed to update priority order', color: 'red' });
        }
    };

    const moveRule = (index: number, direction: 'up' | 'down') => {
        const newRules = [...rules];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newRules.length) return;
        
        // Swap
        const temp = newRules[index];
        newRules[index] = newRules[targetIndex];
        newRules[targetIndex] = temp;
        
        setRules(newRules);
        updatePriorities(newRules);
    };

    // HTML5 Drag and Drop handlers
    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.setData('text/plain', String(index));
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        setDragOverIndex(null);
        const sourceIndex = Number(e.dataTransfer.getData('text/plain'));
        if (sourceIndex === targetIndex) return;

        const newRules = [...rules];
        const [removed] = newRules.splice(sourceIndex, 1);
        newRules.splice(targetIndex, 0, removed);
        
        setRules(newRules);
        updatePriorities(newRules);
    };

    const formatDays = (daysCsv?: string) => {
        if (!daysCsv) return 'Every Day';
        const indices = daysCsv.split(',');
        const labels = indices.map(idx => DAYS.find(d => d.value === idx)?.label.slice(0, 3));
        return labels.join(', ');
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
                    {rules.map((rule, index) => {
                        const isCurrentlyActive = activeRule?.id === rule.id;
                        const isDraggingOver = dragOverIndex === index;
                        return (
                            <Card
                                key={rule.id}
                                withBorder
                                radius="md"
                                p="md"
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDrop={(e) => handleDrop(e, index)}
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
                                                    Source: {rule.source === 'playlist' ? `Playlist: ${playlists.find(p => p.id === rule.playlist_id)?.name || 'Unknown'}` : 'Entire Library'}
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
                                            onChange={(e) => handleToggleEnabled(rule, e.currentTarget.checked)}
                                            size="sm"
                                        />
                                        <Divider orientation="vertical" />
                                        <ActionIcon variant="light" color="blue" onClick={() => openEditModal(rule)}>
                                            <IconPencil size="1rem" />
                                        </ActionIcon>
                                        <ActionIcon variant="light" color="red" onClick={() => handleDeleteRule(rule.id)}>
                                            <IconTrash size="1rem" />
                                        </ActionIcon>
                                        <Divider orientation="vertical" />
                                        <ActionIcon variant="transparent" disabled={index === 0} onClick={() => moveRule(index, 'up')}>
                                            <IconArrowUp size="1rem" />
                                        </ActionIcon>
                                        <ActionIcon variant="transparent" disabled={index === rules.length - 1} onClick={() => moveRule(index, 'down')}>
                                            <IconArrowDown size="1rem" />
                                        </ActionIcon>
                                    </Group>
                                </Group>
                            </Card>
                        );
                    })}
                </Stack>
            )}

            <Modal
                opened={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editingRuleId ? 'Edit Scheduled Rule' : 'Add Scheduled Rule'}
                size="md"
            >
                <Stack gap="md">
                    <TextInput
                        label="Rule Name"
                        placeholder="e.g. Work Hours, Holiday Mode"
                        required
                        value={ruleName}
                        onChange={(e) => setRuleName(e.currentTarget.value)}
                    />

                    <Switch
                        label="Enabled"
                        checked={ruleEnabled}
                        onChange={(e) => setRuleEnabled(e.currentTarget.checked)}
                    />

                    <Divider label="Conditions (Matches when ALL defined match)" labelPosition="center" />

                    <MultiSelect
                        label="Days of the Week"
                        placeholder="Select days"
                        data={DAYS}
                        value={selectedDays}
                        onChange={setSelectedDays}
                    />

                    <Group grow gap="xs">
                        <Stack gap={2}>
                            <Text size="xs" fw={500}>Start Month & Day</Text>
                            <Group gap="xs" wrap="nowrap">
                                <Select
                                    placeholder="Month"
                                    data={MONTHS}
                                    value={startMonth}
                                    onChange={setStartMonth}
                                    clearable
                                    style={{ width: 100 }}
                                />
                                <TextInput
                                    placeholder="Day"
                                    value={startDay}
                                    onChange={(e) => setStartDay(e.currentTarget.value.replace(/\D/g, '').slice(0, 2))}
                                    style={{ width: 65 }}
                                />
                            </Group>
                        </Stack>
                        <Stack gap={2}>
                            <Text size="xs" fw={500}>End Month & Day</Text>
                            <Group gap="xs" wrap="nowrap">
                                <Select
                                    placeholder="Month"
                                    data={MONTHS}
                                    value={endMonth}
                                    onChange={setEndMonth}
                                    clearable
                                    style={{ width: 100 }}
                                />
                                <TextInput
                                    placeholder="Day"
                                    value={endDay}
                                    onChange={(e) => setEndDay(e.currentTarget.value.replace(/\D/g, '').slice(0, 2))}
                                    style={{ width: 65 }}
                                />
                            </Group>
                        </Stack>
                    </Group>

                    <Group grow gap="xs">
                        <TextInput
                            label="Start Time"
                            placeholder="18:00"
                            value={startTime}
                            onChange={(e) => setStartTime(e.currentTarget.value)}
                            description="HH:MM format"
                        />
                        <TextInput
                            label="End Time"
                            placeholder="06:00"
                            value={endTime}
                            onChange={(e) => setEndTime(e.currentTarget.value)}
                            description="HH:MM format"
                        />
                    </Group>

                    <Divider label="Overrides" labelPosition="center" />

                    <Select
                        label="Wallpaper Source"
                        data={[
                            { label: 'Entire Library', value: 'entire_library' },
                            { label: 'Playlist', value: 'playlist' }
                        ]}
                        value={ruleSource}
                        onChange={(val) => setRuleSource((val as 'entire_library' | 'playlist') || 'entire_library')}
                    />

                    {ruleSource === 'playlist' && (
                        <Select
                            label="Playlist Source"
                            placeholder="Select playlist"
                            data={playlists.map(p => ({ label: p.name, value: String(p.id) }))}
                            value={rulePlaylistId}
                            onChange={setRulePlaylistId}
                            required
                        />
                    )}

                    <Select
                        label="Wallpaper Style Override"
                        data={[
                            { label: 'Fill', value: 'fill' },
                            { label: 'Fit', value: 'fit' },
                            { label: 'Stretch', value: 'stretch' },
                            { label: 'Center', value: 'center' },
                            { label: 'Span', value: 'span' }
                        ]}
                        value={ruleStyle}
                        onChange={setRuleStyle}
                    />

                    <Button mt="md" color="blue" onClick={handleSaveRule}>
                        Save Rule
                    </Button>
                </Stack>
            </Modal>
        </Stack>
    );
}
