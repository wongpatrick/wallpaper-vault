/**
 * @file
 * Module: Rule Edit Modal
 * Description: Modal dialog to configure and save a rotation override rule.
 */
import { useState } from 'react';
import {
    Modal, Stack, TextInput, Switch, Divider, MultiSelect, Group, Text, Select, Button
} from '@mantine/core';
import { DAYS, MONTHS, type RotationRule, type PlaylistOption, type RuleFormData } from '../types/rotation';

interface RuleEditModalProps {
    opened: boolean;
    onClose: () => void;
    rule: RotationRule | null;
    initialDatePreset?: string | null;
    playlists: PlaylistOption[];
    onSave: (data: RuleFormData) => Promise<void>;
}

function getInitialFormValues(rule: RotationRule | null, initialDatePreset?: string | null) {
    if (rule) {
        let sm: string | null = null;
        let sd = '';
        if (rule.start_date) {
            const [m, d] = rule.start_date.split('-');
            sm = m;
            sd = d;
        }

        let em: string | null = null;
        let ed = '';
        if (rule.end_date) {
            const [m, d] = rule.end_date.split('-');
            em = m;
            ed = d;
        }

        return {
            ruleName: rule.name,
            ruleEnabled: rule.enabled === 1,
            ruleSource: (rule.source as 'entire_library' | 'playlist') || 'entire_library',
            rulePlaylistId: rule.playlist_id ? String(rule.playlist_id) : null,
            ruleStyle: rule.style || 'fill',
            selectedDays: rule.days_of_week ? rule.days_of_week.split(',') : [],
            startMonth: sm,
            startDay: sd,
            endMonth: em,
            endDay: ed,
            startTime: rule.start_time || '',
            endTime: rule.end_time || ''
        };
    }

    let sm: string | null = null;
    let sd = '';
    let em: string | null = null;
    let ed = '';
    if (initialDatePreset) {
        const [m, d] = initialDatePreset.split('-');
        sm = m;
        sd = d;
        em = m;
        ed = d;
    }

    return {
        ruleName: initialDatePreset ? `Rule for ${initialDatePreset}` : '',
        ruleEnabled: true,
        ruleSource: 'entire_library' as const,
        rulePlaylistId: null as string | null,
        ruleStyle: 'fill' as string | null,
        selectedDays: [] as string[],
        startMonth: sm,
        startDay: sd,
        endMonth: em,
        endDay: ed,
        startTime: '',
        endTime: ''
    };
}

export function RuleEditModal({
    opened,
    onClose,
    rule,
    initialDatePreset,
    playlists,
    onSave
}: RuleEditModalProps) {
    const [prevKey, setPrevKey] = useState<string>('');
    const currentKey = `${opened ? '1' : '0'}-${rule?.id ?? 'new'}-${initialDatePreset ?? ''}`;

    const [ruleName, setRuleName] = useState('');
    const [ruleEnabled, setRuleEnabled] = useState(true);
    const [ruleSource, setRuleSource] = useState<'entire_library' | 'playlist'>('entire_library');
    const [rulePlaylistId, setRulePlaylistId] = useState<string | null>(null);
    const [ruleStyle, setRuleStyle] = useState<string | null>('fill');

    const [selectedDays, setSelectedDays] = useState<string[]>([]);
    const [startMonth, setStartMonth] = useState<string | null>(null);
    const [startDay, setStartDay] = useState<string>('');
    const [endMonth, setEndMonth] = useState<string | null>(null);
    const [endDay, setEndDay] = useState<string>('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');

    if (opened && currentKey !== prevKey) {
        setPrevKey(currentKey);
        const init = getInitialFormValues(rule, initialDatePreset);
        setRuleName(init.ruleName);
        setRuleEnabled(init.ruleEnabled);
        setRuleSource(init.ruleSource);
        setRulePlaylistId(init.rulePlaylistId);
        setRuleStyle(init.ruleStyle);
        setSelectedDays(init.selectedDays);
        setStartMonth(init.startMonth);
        setStartDay(init.startDay);
        setEndMonth(init.endMonth);
        setEndDay(init.endDay);
        setStartTime(init.startTime);
        setEndTime(init.endTime);
    }

    const handleSave = async () => {
        let startDate: string | undefined = undefined;
        let endDate: string | undefined = undefined;

        if (startMonth && startDay) {
            startDate = `${startMonth}-${startDay.padStart(2, '0')}`;
        }
        if (endMonth && endDay) {
            endDate = `${endMonth}-${endDay.padStart(2, '0')}`;
        }

        const payload: RuleFormData = {
            name: ruleName,
            enabled: ruleEnabled ? 1 : 0,
            source: ruleSource,
            playlist_id: ruleSource === 'playlist' && rulePlaylistId ? parseInt(rulePlaylistId) : undefined,
            style: ruleStyle || undefined,
            days_of_week: selectedDays.length > 0 ? selectedDays.join(',') : undefined,
            start_date: startDate,
            end_date: endDate,
            start_time: startTime || undefined,
            end_time: endTime || undefined
        };

        await onSave(payload);
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={rule ? 'Edit Scheduled Rule' : 'Add Scheduled Rule'}
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

                <Button mt="md" color="blue" onClick={handleSave} disabled={!ruleName.trim()}>
                    Save Rule
                </Button>
            </Stack>
        </Modal>
    );
}
