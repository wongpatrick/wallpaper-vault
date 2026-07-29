/**
 * @file
 * Unit tests for import validation folder parsing logic.
 * Verifies Unicode hyphen/dash handling and multi-artist delimiter extraction.
 */
import { describe, it, expect } from 'vitest';

describe('Folder Name Parsing Rules', () => {
    const parseFolderName = (folderName: string) => {
        let nameParts = folderName.split(/\s+[-–—\u2010-\u2015\uff0d]\s+|\s*[–—\u2010-\u2015\uff0d]\s*/);
        if (nameParts.length <= 1) {
            nameParts = folderName.split(/\s*[-–—\u2010-\u2015\uff0d]\s*/);
        }
        if (nameParts.length > 1) {
            const artistPart = nameParts[0].trim();
            const titlePart = nameParts.slice(1).join(' - ').trim();
            const artistNames = artistPart.split(/[&＆,/+]/).map(a => a.trim()).filter(Boolean);
            return { creatorNames: artistNames, setTitle: titlePart };
        }
        return { creatorNames: [], setTitle: folderName };
    };

    it('parses Asian folder names with standard hyphens', () => {
        const result = parseFolderName('柒柒要乖哦 - 雨天邂逅');
        expect(result.creatorNames).toEqual(['柒柒要乖哦']);
        expect(result.setTitle).toBe('雨天邂逅');
    });

    it('parses folder names with hyphenated creator names like X-LEVEL', () => {
        const result = parseFolderName('X-LEVEL & Yeha (예하) - The Nun');
        expect(result.creatorNames).toEqual(['X-LEVEL', 'Yeha (예하)']);
        expect(result.setTitle).toBe('The Nun');
    });

    it('parses folder names with en-dash and em-dash', () => {
        const enDash = parseFolderName('Artist A – EnDash Set');
        expect(enDash.creatorNames).toEqual(['Artist A']);
        expect(enDash.setTitle).toBe('EnDash Set');

        const emDash = parseFolderName('Artist B — EmDash Set');
        expect(emDash.creatorNames).toEqual(['Artist B']);
        expect(emDash.setTitle).toBe('EmDash Set');
    });

    it('parses multi-artist folder names with varied delimiters', () => {
        const ampersand = parseFolderName('Artist 1 & Artist 2 - Joint Set');
        expect(ampersand.creatorNames).toEqual(['Artist 1', 'Artist 2']);
        expect(ampersand.setTitle).toBe('Joint Set');

        const fullwidthAmp = parseFolderName('Artist X ＆ Artist Y - Joint Set 2');
        expect(fullwidthAmp.creatorNames).toEqual(['Artist X', 'Artist Y']);
        expect(fullwidthAmp.setTitle).toBe('Joint Set 2');

        const slash = parseFolderName('Creator A / Creator B - Collab');
        expect(slash.creatorNames).toEqual(['Creator A', 'Creator B']);
        expect(slash.setTitle).toBe('Collab');
    });
});
