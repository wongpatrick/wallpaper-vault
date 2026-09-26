/**
 * @file
 * Module: Rotation Rules Utilities
 * Description: Pure utility functions, types, and constants for wallpaper rotation rules.
 */
import type { RotationRule } from '../api/model/rotationRule';
import type { RuleSource, WallpaperStyle } from '../types/rotation';
export type { RuleSource, WallpaperStyle };

export const PRIORITY_STEP = 10;

export const MONTH_LABELS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
] as const;

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const SUNDAY_INDEX = 6;
export const SUNDAY_ISO_VAL = 7;

export interface MatchedRule {
    rule: RotationRule;
    timeWindow: string;
}

/**
 * Format a start and end time pair into a human-readable time window string.
 */
export function formatTimeWindow(startTime?: string | null, endTime?: string | null): string {
    return startTime && endTime ? `${startTime} - ${endTime}` : 'All Day';
}

/**
 * Evaluates whether a rule's day-of-week and date range conditions match a specific Date.
 * Ignores time of day (used for calendar display).
 */
export function evaluateRuleDateMatch(
    rule: Pick<RotationRule, 'days_of_week' | 'start_date' | 'end_date'>,
    date: Date
): boolean {
    // 1. Day of week match (Mon=1 ... Sun=7)
    if (rule.days_of_week) {
        const dayOfWeekStr = String(date.getDay() === 0 ? SUNDAY_ISO_VAL : date.getDay());
        const allowedDays = rule.days_of_week.split(',').map(d => d.trim());
        if (!allowedDays.includes(dayOfWeekStr)) {
            return false;
        }
    }

    // 2. Date range match (MM-DD)
    if (rule.start_date && rule.end_date) {
        const monthPart = String(date.getMonth() + 1).padStart(2, '0');
        const datePart = String(date.getDate()).padStart(2, '0');
        const currentMd = `${monthPart}-${datePart}`;
        const start = rule.start_date;
        const end = rule.end_date;

        if (start <= end) {
            if (currentMd < start || currentMd > end) {
                return false;
            }
        } else {
            // Crosses new year (e.g. 12-15 to 01-15)
            if (currentMd < start && currentMd > end) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Filter enabled rules that match the given date, and sort them in descending priority order.
 */
export function getRulesForDate(date: Date, rules: RotationRule[]): MatchedRule[] {
    const enabledRules = rules.filter(r => r.enabled === 1);
    const matched: MatchedRule[] = [];

    for (const rule of enabledRules) {
        if (!evaluateRuleDateMatch(rule, date)) {
            continue;
        }

        matched.push({
            rule,
            timeWindow: formatTimeWindow(rule.start_time, rule.end_time)
        });
    }

    return matched.sort((a, b) => (b.rule.priority ?? 0) - (a.rule.priority ?? 0));
}
