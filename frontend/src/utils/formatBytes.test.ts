/**
 * @file
 * Unit tests for formatBytes.ts.
 * Verifies byte size formatting and edge cases.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect } from 'vitest';
import { formatBytes } from './formatBytes';

describe('formatBytes', () => {
    it('should return Invalid size for negative values', () => {
        expect(formatBytes(-10)).toBe('Invalid size');
        expect(formatBytes(-12345)).toBe('Invalid size');
    });

    it('should return 0 Bytes for 0', () => {
        expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format fractional sizes between 0 and 1 correctly', () => {
        expect(formatBytes(0.5)).toBe('0.50 Bytes');
        expect(formatBytes(0.123, 3)).toBe('0.123 Bytes');
    });

    it('should format bytes correctly', () => {
        expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('should format kilobytes correctly with default 2 decimals', () => {
        expect(formatBytes(1024)).toBe('1 KB');
        expect(formatBytes(1536)).toBe('1.5 KB');
        expect(formatBytes(12345)).toBe('12.06 KB');
    });

    it('should respect custom decimals', () => {
        expect(formatBytes(12345, 1)).toBe('12.1 KB');
        expect(formatBytes(12345, 0)).toBe('12 KB');
    });

    it('should default negative decimals to 0', () => {
        expect(formatBytes(12345, -1)).toBe('12 KB');
    });

    it('should format megabytes, gigabytes and larger sizes correctly', () => {
        expect(formatBytes(1024 * 1024)).toBe('1 MB');
        expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
        expect(formatBytes(Math.pow(1024, 4))).toBe('1 TB');
    });

    it('should handle sizes exceeding YB (Yottabytes) safely', () => {
        expect(formatBytes(Math.pow(1024, 10))).toBe('1048576 YB');
    });
});
