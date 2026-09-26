/**
 * @file
 * Component: RotationRulesCalendar
 * Description: Monthly scheduled rules calendar grid with day-level detail modals.
 */
import { useState } from 'react';
import {
    Paper,
    Group,
    Text,
    ActionIcon,
    SimpleGrid,
    Badge,
    Tooltip,
    Stack,
    Box,
    Modal,
    Button
} from '@mantine/core';
import {
    IconChevronLeft,
    IconChevronRight,
    IconPlus
} from '@tabler/icons-react';
import type { RotationRule } from '../api/model/rotationRule';
import type { PlaylistOption } from '../types/rotation';
import {
    MONTH_LABELS,
    WEEKDAY_LABELS,
    SUNDAY_INDEX,
    getRulesForDate
} from './rotationRulesUtils';

interface RotationRulesCalendarProps {
    rules: RotationRule[];
    playlists: PlaylistOption[];
    onAddRuleForDate?: (date: Date) => void;
}

const FW_BOLD = 700;
const FW_MEDIUM = 500;

export function RotationRulesCalendar({ rules, playlists, onAddRuleForDate }: RotationRulesCalendarProps) {
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    // Adjust day of week index to match ISO (Mon=0, Sun=6)
    let startDayIdx = firstDayOfMonth.getDay() - 1;
    if (startDayIdx < 0) startDayIdx = SUNDAY_INDEX;

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Create days array for rendering grid
    const daysArray: (Date | null)[] = [];
    for (let i = 0; i < startDayIdx; i++) {
        daysArray.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        daysArray.push(new Date(year, month, i));
    }

    const handlePrevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    return (
        <Stack gap="md">
            <Group justify="space-between" mb="xs">
                <Text size="sm" c="dimmed">
                    Visualizing all active scheduled rules for the current month. Days show matching rules and their time windows in priority order. Click a cell to view day details or schedule a new rule.
                </Text>
                <Group gap="xs">
                    <ActionIcon variant="outline" onClick={handlePrevMonth} aria-label="Previous month">
                        <IconChevronLeft size="1rem" />
                    </ActionIcon>
                    <Text fw={600} size="md" w={120} style={{ textAlign: 'center' }}>
                        {MONTH_LABELS[month]} {year}
                    </Text>
                    <ActionIcon variant="outline" onClick={handleNextMonth} aria-label="Next month">
                        <IconChevronRight size="1rem" />
                    </ActionIcon>
                </Group>
            </Group>

            <SimpleGrid cols={7} spacing="xs">
                {WEEKDAY_LABELS.map(lbl => (
                    <Text key={lbl} size="xs" fw={FW_BOLD} style={{ textAlign: 'center' }} c="dimmed">
                        {lbl}
                    </Text>
                ))}

                {daysArray.map((date, idx) => {
                    if (!date) {
                        return <Box key={`empty-${idx}`} />;
                    }

                    const isToday = new Date().toDateString() === date.toDateString();
                    const matchedRules = getRulesForDate(date, rules);

                    return (
                        <Paper
                            key={date.toISOString()}
                            withBorder
                            p="xs"
                            radius="md"
                            onClick={() => setSelectedDate(date)}
                            style={{
                                minHeight: 90,
                                display: 'flex',
                                flexDirection: 'column',
                                backgroundColor: isToday ? 'var(--mantine-color-blue-light)' : undefined,
                                borderColor: isToday ? 'var(--mantine-color-blue-filled)' : undefined,
                                cursor: 'pointer',
                                transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = 'var(--mantine-shadow-xs)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            <Group justify="space-between" wrap="nowrap" mb="xs">
                                <Text size="xs" fw={isToday ? FW_BOLD : FW_MEDIUM} c={isToday ? 'blue' : undefined}>
                                    {date.getDate()}
                                </Text>
                                {isToday && (
                                    <Badge size="xs" color="blue" variant="filled">
                                        Today
                                    </Badge>
                                )}
                            </Group>

                            <Stack gap={2} style={{ flexGrow: 1, overflowY: 'auto' }}>
                                {matchedRules.map(({ rule, timeWindow }) => {
                                    const playlistName = rule.source === 'playlist'
                                        ? playlists.find(p => p.id === rule.playlist_id)?.name || 'Playlist'
                                        : 'Library';
                                    const label = `Rule: ${rule.name}\nSource: ${playlistName}\nTime: ${timeWindow}\nFit: ${rule.style || 'fill'}`;

                                    return (
                                        <Tooltip key={rule.id} label={label} multiline withArrow>
                                            <Badge
                                                size="xs"
                                                variant="light"
                                                color={rule.source === 'playlist' ? 'blue' : 'violet'}
                                                style={{ textTransform: 'none', cursor: 'help' }}
                                                fullWidth
                                            >
                                                <Group justify="space-between" wrap="nowrap" gap={2} style={{ width: '100%' }}>
                                                    <Text size="10px" fw={600} style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                                        {rule.name}
                                                    </Text>
                                                    <Text size="9px" c="dimmed" style={{ flexShrink: 0 }}>
                                                        {timeWindow.replace(/\s+/g, '')}
                                                    </Text>
                                                </Group>
                                            </Badge>
                                        </Tooltip>
                                    );
                                })}
                            </Stack>
                        </Paper>
                    );
                })}
            </SimpleGrid>

            <Modal
                opened={selectedDate !== null}
                onClose={() => setSelectedDate(null)}
                title={selectedDate ? `Rules for ${MONTH_LABELS[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}` : ''}
                size="md"
            >
                {selectedDate && (() => {
                    const matchedRules = getRulesForDate(selectedDate, rules);
                    return (
                        <Stack gap="md">
                            {matchedRules.length === 0 ? (
                                <Text size="sm" c="dimmed" style={{ textAlign: 'center' }} my="xl">
                                    No scheduled override rules match this day.
                                </Text>
                            ) : (
                                <Stack gap="xs">
                                    {matchedRules.map(({ rule, timeWindow }) => {
                                        const playlistName = rule.source === 'playlist'
                                            ? playlists.find(p => p.id === rule.playlist_id)?.name || 'Playlist'
                                            : 'Library';
                                        return (
                                            <Paper key={rule.id} withBorder p="sm" radius="md">
                                                <Group justify="space-between" mb="xs" wrap="nowrap">
                                                    <Text fw={600} size="sm">{rule.name}</Text>
                                                    <Badge size="xs" color="blue">Priority: {rule.priority}</Badge>
                                                </Group>
                                                <Stack gap={4}>
                                                    <Text size="xs" c="dimmed">🕒 Active Hours: {timeWindow}</Text>
                                                    <Text size="xs" c="dimmed">📦 Source Override: {rule.source === 'playlist' ? `Playlist: ${playlistName}` : 'Entire Library'}</Text>
                                                    <Text size="xs" c="dimmed">🖼️ Wallpaper Style: {rule.style || 'fill'}</Text>
                                                </Stack>
                                            </Paper>
                                        );
                                    })}
                                </Stack>
                            )}

                            {onAddRuleForDate && (
                                <Button
                                    leftSection={<IconPlus size="1rem" />}
                                    color="blue"
                                    fullWidth
                                    onClick={() => {
                                        onAddRuleForDate(selectedDate);
                                        setSelectedDate(null);
                                    }}
                                    mt="xs"
                                >
                                    Add Rule for this Date
                                </Button>
                            )}
                        </Stack>
                    );
                })()}
            </Modal>
        </Stack>
    );
}
