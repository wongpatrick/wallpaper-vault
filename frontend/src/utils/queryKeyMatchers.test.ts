/**
 * @file
 * Tests for queryKeyMatchers utility.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect } from 'vitest';
import { matchesEndpoint, matchesAnyEndpoint } from './queryKeyMatchers';

describe('queryKeyMatchers', () => {
    describe('matchesEndpoint', () => {
        it('matches direct string keys', () => {
            expect(matchesEndpoint(['sets'], 'sets')).toBe(true);
            expect(matchesEndpoint(['images'], 'images')).toBe(true);
            expect(matchesEndpoint(['creators'], 'sets')).toBe(false);
        });

        it('matches api prefixed paths', () => {
            expect(matchesEndpoint(['/api/sets/'], 'sets')).toBe(true);
            expect(matchesEndpoint(['/api/images/123'], 'images')).toBe(true);
            expect(matchesEndpoint(['/api/creators'], 'sets')).toBe(false);
        });

        it('matches multi-vault prefixed keys', () => {
            expect(matchesEndpoint(['multi-vault', 'sets'], 'sets')).toBe(true);
            expect(matchesEndpoint(['multi-vault', '/api/sets/'], 'sets')).toBe(true);
            expect(matchesEndpoint(['multi-vault', 'images', 1], 'images')).toBe(true);
            expect(matchesEndpoint(['multi-vault', 'creators'], 'sets')).toBe(false);
        });

        it('returns false for non-string or empty keys', () => {
            expect(matchesEndpoint([], 'sets')).toBe(false);
            expect(matchesEndpoint([123 as unknown as string], 'sets')).toBe(false);
            expect(matchesEndpoint(['multi-vault', 123 as unknown as string], 'sets')).toBe(false);
        });
    });

    describe('matchesAnyEndpoint', () => {
        it('matches if any target matches', () => {
            expect(matchesAnyEndpoint(['sets'], ['images', 'sets', 'dashboard'])).toBe(true);
            expect(matchesAnyEndpoint(['/api/images/list'], ['images', 'sets'])).toBe(true);
            expect(matchesAnyEndpoint(['multi-vault', 'dashboard'], ['images', 'sets', 'dashboard'])).toBe(true);
            expect(matchesAnyEndpoint(['creators'], ['images', 'sets', 'dashboard'])).toBe(false);
        });
    });
});
