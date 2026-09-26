/**
 * @file
 * Module: Rule Edit Modal
 * Description: Modal dialog to configure and save a rotation override rule.
 */
import { useEffect } from 'react';
import {
    Modal, Stack, TextInput, Switch, Divider, MultiSelect, Group, Text, Select, Button
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { DAYS, MONTHS } from '../types/rotation';
import type { PlaylistOption, RuleFormData, RuleSource, WallpaperStyle } from '../types/rotation';
import type { RotationRule } from '../api/model/rotationRule';

interface RuleEditModalProps {
    opened: boolean;
    onClose: () => void;
    rule: RotationRule | null;
    initialDatePreset?: string | null;
    playlists: PlaylistOption[];
    onSave: (data: RuleFormData) => Promise<void>;
}

interface FormValues {
    ruleName: string;
    ruleEnabled: boolean;
    ruleSource: RuleSource;
    rulePlaylistId: string | null;
    ruleStyle: WallpaperStyle | null;
    selectedDays: string[];
    startMonth: string | null;
    startDay: string;
    endMonth: string | null;
    endDay: string;
    startTime: string;
    endTime: string;
}

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function getInitialFormValues(rule: RotationRule | null, initialDatePreset?: string | null): FormValues {
    if (rule) {
        let sm: string | null = null;
        let sd = '';
        if (rule.start_date) {
            const [m, d] = rule.start_date.split('-');
            sm = m ?? null;
            sd = d ?? '';
        }

        let em: string | null = null;
        let ed = '';
        if (rule.end_date) {
            const [m, d] = rule.end_date.split('-');
            em = m ?? null;
            ed = d ?? '';
        }

        return {
            ruleName: rule.name,
            ruleEnabled: rule.enabled === 1,
            ruleSource: (rule.source as RuleSource) || 'entire_library',
            rulePlaylistId: rule.playlist_id ? String(rule.playlist_id) : null,
            ruleStyle: (rule.style as WallpaperStyle) || 'fill',
            selectedDays: rule.days_of_week ? rule.days_of_week.split(',').map(s => s.trim()).filter(Boolean) : [],
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
        sm = m ?? null;
        sd = d ?? '';
        em = m ?? null;
        ed = d ?? '';
    }

    return {
        ruleName: initialDatePreset ? `Rule for ${initialDatePreset}` : '',
        ruleEnabled: true,
        ruleSource: 'entire_library',
        rulePlaylistId: null,
        ruleStyle: 'fill',
        selectedDays: [],
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
    const form = useForm<FormValues>({
        initialValues: getInitialFormValues(null, null),
        validate: {
            ruleName: (val) => (!val.trim() ? 'Rule name is required' : null),
            startTime: (val) => (val.trim() && !TIME_REGEX.test(val.trim()) ? 'Must be HH:MM format' : null),
            endTime: (val) => (val.trim() && !TIME_REGEX.test(val.trim()) ? 'Must be HH:MM format' : null)
        }
    });

    useEffect(() => {
        if (opened) {
            form.setValues(getInitialFormValues(rule, initialDatePreset));
            form.resetDirty();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, rule?.id, initialDatePreset]);

    const handleSubmit = async (values: FormValues) => {
        const startDate = values.startMonth && values.startDay
            ? `${values.startMonth}-${values.startDay.padStart(2, '0')}`
            : null;
        const endDate = values.endMonth && values.endDay
            ? `${values.endMonth}-${values.endDay.padStart(2, '0')}`
            : null;

        const payload: RuleFormData = {
            name: values.ruleName.trim(),
            enabled: values.ruleEnabled ? 1 : 0,
            source: values.ruleSource,
            playlist_id: values.ruleSource === 'playlist' && values.rulePlaylistId ? parseInt(values.rulePlaylistId, 10) : null,
            style: values.ruleStyle || null,
            days_of_week: values.selectedDays.length > 0 ? values.selectedDays.join(',') : null,
            start_date: startDate,
            end_date: endDate,
            start_time: values.startTime.trim() || null,
            end_time: values.endTime.trim() || null
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
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="md">
                    <TextInput
                        label="Rule Name"
                        placeholder="e.g. Work Hours, Holiday Mode"
                        required
                        {...form.getInputProps('ruleName')}
                    />

                    <Switch
                        label="Enabled"
                        {...form.getInputProps('ruleEnabled', { type: 'checkbox' })}
                    />

                    <Divider label="Conditions (Matches when ALL defined match)" labelPosition="center" />

                    <MultiSelect
                        label="Days of the Week"
                        placeholder="Select days"
                        data={DAYS}
                        {...form.getInputProps('selectedDays')}
                    />

                    <Group grow gap="xs">
                        <Stack gap={2}>
                            <Text size="xs" fw={500}>Start Month & Day</Text>
                            <Group gap="xs" wrap="nowrap">
                                <Select
                                    placeholder="Month"
                                    data={MONTHS}
                                    clearable
                                    style={{ width: 100 }}
                                    {...form.getInputProps('startMonth')}
                                />
                                <TextInput
                                    placeholder="Day"
                                    value={form.values.startDay}
                                    onChange={(e) => form.setFieldValue('startDay', e.currentTarget.value.replace(/\D/g, '').slice(0, 2))}
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
                                    clearable
                                    style={{ width: 100 }}
                                    {...form.getInputProps('endMonth')}
                                />
                                <TextInput
                                    placeholder="Day"
                                    value={form.values.endDay}
                                    onChange={(e) => form.setFieldValue('endDay', e.currentTarget.value.replace(/\D/g, '').slice(0, 2))}
                                    style={{ width: 65 }}
                                />
                            </Group>
                        </Stack>
                    </Group>

                    <Group grow gap="xs">
                        <TextInput
                            label="Start Time"
                            placeholder="18:00"
                            description="HH:MM format"
                            {...form.getInputProps('startTime')}
                        />
                        <TextInput
                            label="End Time"
                            placeholder="06:00"
                            description="HH:MM format"
                            {...form.getInputProps('endTime')}
                        />
                    </Group>

                    <Divider label="Overrides" labelPosition="center" />

                    <Select
                        label="Wallpaper Source"
                        data={[
                            { label: 'Entire Library', value: 'entire_library' },
                            { label: 'Playlist', value: 'playlist' }
                        ]}
                        {...form.getInputProps('ruleSource')}
                    />

                    {form.values.ruleSource === 'playlist' && (
                        <Select
                            label="Playlist Source"
                            placeholder="Select playlist"
                            data={playlists.map(p => ({ label: p.name, value: String(p.id) }))}
                            required
                            {...form.getInputProps('rulePlaylistId')}
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
                        {...form.getInputProps('ruleStyle')}
                    />

                    <Button mt="md" color="blue" type="submit" disabled={!form.values.ruleName.trim()}>
                        Save Rule
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
}
