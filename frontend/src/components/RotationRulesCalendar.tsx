/**
 * @file Component for rendering a monthly scheduled rules calendar grid.
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

interface Playlist {
    id: number;
    name: string;
}

interface RotationRule {
    id: number;
    name: string;
    priority: number;
    enabled: number;
    start_date?: string; // MM-DD
    end_date?: string;   // MM-DD
    days_of_week?: string; // Comma separated, e.g. "1,2,3"
    start_time?: string; // HH:MM
    end_time?: string;   // HH:MM
    source: string;
    playlist_id?: number;
    style?: string;
}

interface RotationRulesCalendarProps {
    rules: RotationRule[];
    playlists: Playlist[];
    onAddRuleForDate?: (date: Date) => void;
}

const MONTH_LABELS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SUNDAY_INDEX = 6;
const SUNDAY_ISO_VAL = 7;
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

    // Helper to evaluate if a rule matches a specific date (ignoring current time)
    const getRulesForDate = (date: Date): { rule: RotationRule; timeWindow: string }[] => {
        const enabledRules = rules.filter(r => r.enabled === 1);
        const dayOfWeekStr = String(date.getDay() === 0 ? SUNDAY_ISO_VAL : date.getDay());
        const monthPart = String(date.getMonth() + 1).padStart(2, '0');
        const datePart = String(date.getDate()).padStart(2, '0');
        const currentMd = `${monthPart}-${datePart}`;

        const matched: { rule: RotationRule; timeWindow: string }[] = [];

        for (const rule of enabledRules) {
            // 1. Day of week match
            if (rule.days_of_week) {
                const allowedDays = rule.days_of_week.split(',').map(d => d.trim());
                if (!allowedDays.includes(dayOfWeekStr)) {
                    continue;
                }
            }

            // 2. Date range match (MM-DD)
            if (rule.start_date && rule.end_date) {
                const start = rule.start_date;
                const end = rule.end_date;
                if (start <= end) {
                    if (currentMd < start || currentMd > end) continue;
                } else {
                    // Crosses new year
                    if (currentMd < start && currentMd > end) continue;
                }
            }

            // If it matches date/day, append it. We list its active time window if defined.
            const timeWindow = rule.start_time && rule.end_time
                ? `${rule.start_time} - ${rule.end_time}`
                : 'All Day';

            matched.push({ rule, timeWindow });
        }

        // Sort matched rules by priority descending
        return matched.sort((a, b) => b.rule.priority - a.rule.priority);
    };

    return (
        <Stack gap="md">
            <Group justify="space-between" mb="xs">
                <Text size="sm" c="dimmed">
                    Visualizing all active scheduled rules for the current month. Days show matching rules and their time windows in priority order. Click a cell to view day details or schedule a new rule.
                </Text>
                <Group gap="xs">
                    <ActionIcon variant="outline" onClick={handlePrevMonth}>
                        <IconChevronLeft size="1rem" />
                    </ActionIcon>
                    <Text fw={600} size="md" w={120} style={{ textAlign: 'center' }}>
                        {MONTH_LABELS[month]} {year}
                    </Text>
                    <ActionIcon variant="outline" onClick={handleNextMonth}>
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
                    const matchedRules = getRulesForDate(date);

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
                    const matchedRules = getRulesForDate(selectedDate);
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


