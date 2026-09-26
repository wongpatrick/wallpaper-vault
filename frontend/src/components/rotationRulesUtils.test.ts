/**
 * @file
 * Unit tests for rotationRulesUtils.ts.
 * Verifies time window formatting, rule date/day evaluation, and rule filtering/sorting.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect } from 'vitest';
import {
    formatTimeWindow,
    evaluateRuleDateMatch,
    getRulesForDate
} from './rotationRulesUtils';
import type { RotationRule } from '../api/model/rotationRule';

describe('rotationRulesUtils', () => {
    describe('formatTimeWindow', () => {
        it('formats start and end time', () => {
            expect(formatTimeWindow('09:00', '17:00')).toBe('09:00 - 17:00');
        });

        it('returns "All Day" when either or both times are missing', () => {
            expect(formatTimeWindow(null, '17:00')).toBe('All Day');
            expect(formatTimeWindow('09:00', null)).toBe('All Day');
            expect(formatTimeWindow(undefined, undefined)).toBe('All Day');
        });
    });

    describe('evaluateRuleDateMatch', () => {
        it('matches any date when no days or date ranges are specified', () => {
            const rule: Pick<RotationRule, 'days_of_week' | 'start_date' | 'end_date'> = {};
            expect(evaluateRuleDateMatch(rule, new Date(2026, 5, 15))).toBe(true);
        });

        it('matches allowed days of week', () => {
            // Monday = 1, Wednesday = 3
            const rule = { days_of_week: '1, 3' };
            // 2026-09-28 is a Monday
            const monday = new Date('2026-09-28T12:00:00');
            // 2026-09-29 is a Tuesday
            const tuesday = new Date('2026-09-29T12:00:00');
            // 2026-09-30 is a Wednesday
            const wednesday = new Date('2026-09-30T12:00:00');

            expect(evaluateRuleDateMatch(rule, monday)).toBe(true);
            expect(evaluateRuleDateMatch(rule, tuesday)).toBe(false);
            expect(evaluateRuleDateMatch(rule, wednesday)).toBe(true);
        });

        it('correctly maps Sunday to ISO day 7', () => {
            const rule = { days_of_week: '7' };
            // 2026-09-27 is a Sunday
            const sunday = new Date('2026-09-27T12:00:00');
            // 2026-09-28 is a Monday
            const monday = new Date('2026-09-28T12:00:00');

            expect(evaluateRuleDateMatch(rule, sunday)).toBe(true);
            expect(evaluateRuleDateMatch(rule, monday)).toBe(false);
        });

        it('matches within standard date range (start <= end)', () => {
            const rule = { start_date: '03-01', end_date: '05-31' };
            expect(evaluateRuleDateMatch(rule, new Date('2026-04-15T12:00:00'))).toBe(true);
            expect(evaluateRuleDateMatch(rule, new Date('2026-03-01T12:00:00'))).toBe(true);
            expect(evaluateRuleDateMatch(rule, new Date('2026-05-31T12:00:00'))).toBe(true);
            expect(evaluateRuleDateMatch(rule, new Date('2026-06-01T12:00:00'))).toBe(false);
            expect(evaluateRuleDateMatch(rule, new Date('2026-02-28T12:00:00'))).toBe(false);
        });

        it('matches cross-year date range (start > end, e.g. holiday season)', () => {
            const rule = { start_date: '12-15', end_date: '01-15' };
            // In range (December)
            expect(evaluateRuleDateMatch(rule, new Date('2026-12-25T12:00:00'))).toBe(true);
            // In range (January)
            expect(evaluateRuleDateMatch(rule, new Date('2026-01-05T12:00:00'))).toBe(true);
            // Out of range (February)
            expect(evaluateRuleDateMatch(rule, new Date('2026-02-01T12:00:00'))).toBe(false);
            // Out of range (November)
            expect(evaluateRuleDateMatch(rule, new Date('2026-11-30T12:00:00'))).toBe(false);
        });
    });

    describe('getRulesForDate', () => {
        const rules: RotationRule[] = [
            {
                id: 1,
                name: 'Low Priority All Year',
                priority: 10,
                enabled: 1,
                source: 'entire_library'
            },
            {
                id: 2,
                name: 'High Priority Weekday',
                priority: 50,
                enabled: 1,
                days_of_week: '1,2,3,4,5',
                start_time: '09:00',
                end_time: '17:00',
                source: 'playlist',
                playlist_id: 2
            },
            {
                id: 3,
                name: 'Disabled Rule',
                priority: 100,
                enabled: 0,
                source: 'entire_library'
            }
        ];

        it('filters out disabled rules and sorts matching rules by priority descending', () => {
            // Monday
            const monday = new Date('2026-09-28T12:00:00');
            const matches = getRulesForDate(monday, rules);

            expect(matches).toHaveLength(2);
            expect(matches[0].rule.id).toBe(2);
            expect(matches[0].timeWindow).toBe('09:00 - 17:00');
            expect(matches[1].rule.id).toBe(1);
            expect(matches[1].timeWindow).toBe('All Day');
        });

        it('filters non-matching rules on weekends', () => {
            // Sunday
            const sunday = new Date('2026-09-27T12:00:00');
            const matches = getRulesForDate(sunday, rules);

            expect(matches).toHaveLength(1);
            expect(matches[0].rule.id).toBe(1);
        });
    });
});
