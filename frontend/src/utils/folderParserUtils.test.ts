/**
 * @file
 * Unit tests for folder parser utilities.
 * Verifies Unicode hyphen/dash handling, multi-artist delimiter extraction,
 * and template <-> regex conversion.
 */
import { describe, it, expect } from 'vitest';
import {
    parseFolderMetadata,
    splitArtistNames,
    templateToRegex,
    regexToTemplate,
    parseFolderNameWithPattern
} from './folderParserUtils';

describe('Folder Name Parsing Rules', () => {
    it('parses Asian folder names with standard hyphens', () => {
        const result = parseFolderMetadata('柒柒要乖哦 - 雨天邂逅');
        expect(result.creatorNames).toEqual(['柒柒要乖哦']);
        expect(result.setTitle).toBe('雨天邂逅');
    });

    it('parses folder names with hyphenated creator names like X-LEVEL', () => {
        const result = parseFolderMetadata('X-LEVEL & Yeha (예하) - The Nun');
        expect(result.creatorNames).toEqual(['X-LEVEL', 'Yeha (예하)']);
        expect(result.setTitle).toBe('The Nun');
    });

    it('parses folder names with en-dash and em-dash', () => {
        const enDash = parseFolderMetadata('Artist A – EnDash Set');
        expect(enDash.creatorNames).toEqual(['Artist A']);
        expect(enDash.setTitle).toBe('EnDash Set');

        const emDash = parseFolderMetadata('Artist B — EmDash Set');
        expect(emDash.creatorNames).toEqual(['Artist B']);
        expect(emDash.setTitle).toBe('EmDash Set');
    });

    it('parses multi-artist folder names with varied delimiters', () => {
        const ampersand = parseFolderMetadata('Artist 1 & Artist 2 - Joint Set');
        expect(ampersand.creatorNames).toEqual(['Artist 1', 'Artist 2']);
        expect(ampersand.setTitle).toBe('Joint Set');

        const fullwidthAmp = parseFolderMetadata('Artist X ＆ Artist Y - Joint Set 2');
        expect(fullwidthAmp.creatorNames).toEqual(['Artist X', 'Artist Y']);
        expect(fullwidthAmp.setTitle).toBe('Joint Set 2');

        const slash = parseFolderMetadata('Creator A / Creator B - Collab');
        expect(slash.creatorNames).toEqual(['Creator A', 'Creator B']);
        expect(slash.setTitle).toBe('Collab');
    });

    it('splits composite artist names cleanly', () => {
        expect(splitArtistNames('Artist 1, Artist 2 + Artist 3')).toEqual(['Artist 1', 'Artist 2', 'Artist 3']);
    });

    it('converts template to regex and vice versa', () => {
        const template = '[Creator] - [Set]';
        const regexStr = templateToRegex(template);
        expect(regexStr).toContain('(?<creator>.+)');
        expect(regexStr).toContain('(?<set>.+)');

        const restoredTemplate = regexToTemplate('^(?<creator>.+?) - (?<set>.+)$');
        expect(restoredTemplate).toBe('[Creator] - [Set]');
    });

    it('parses folder name with pattern and fallback', () => {
        const result = parseFolderNameWithPattern('Artist - Album', '[Creator] - [Set]', false);
        expect(result.isValid).toBe(true);
        expect(result.creator).toBe('Artist');
        expect(result.set).toBe('Album');

        const fallback = parseFolderNameWithPattern('SingleNameFolder', '[Creator] - [Set]', false);
        expect(fallback.isValid).toBe(false);
        expect(fallback.creator).toBe('Unknown');
    });
});
