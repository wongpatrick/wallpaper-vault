/**
 * @file
 * Utility module for parsing folder names into Creator and Set metadata.
 * Provides regex constants, template conversion, and name splitting functions.
 */

export const UNICODE_DASH_CLASS = /[-–—\u2010-\u2015\uff0d]/;
export const DASH_SPLIT_LOOSE = /\s+[-–—\u2010-\u2015\uff0d]\s+|\s*[–—\u2010-\u2015\uff0d]\s*/;
export const DASH_SPLIT_TIGHT = /\s*[-–—\u2010-\u2015\uff0d]\s*/;
export const MULTI_ARTIST_DELIMITERS = /[&＆,/+]/;

export interface ParsedFolderMetadata {
    creatorNames: string[];
    setTitle: string;
    rawCreator: string;
    isParsed: boolean;
}

export interface ParsedPatternResult {
    creator: string;
    set: string;
    isValid: boolean;
}

/**
 * Splits a composite artist string (e.g., "Artist 1 & Artist 2 / Artist 3")
 * into distinct cleaned artist names.
 */
export function splitArtistNames(artistStr: string): string[] {
    return artistStr
        .split(MULTI_ARTIST_DELIMITERS)
        .map(a => a.trim())
        .filter(Boolean);
}

/**
 * Parses a folder name into creatorNames array and setTitle using Unicode dash heuristics.
 */
export function parseFolderMetadata(folderName: string): ParsedFolderMetadata {
    let nameParts = folderName.split(DASH_SPLIT_LOOSE);
    if (nameParts.length <= 1) {
        nameParts = folderName.split(DASH_SPLIT_TIGHT);
    }
    if (nameParts.length > 1) {
        const artistPart = nameParts[0].trim();
        const titlePart = nameParts.slice(1).join(' - ').trim();
        const artistNames = splitArtistNames(artistPart);
        return {
            creatorNames: artistNames,
            setTitle: titlePart,
            rawCreator: artistPart,
            isParsed: true
        };
    }
    return {
        creatorNames: [],
        setTitle: folderName,
        rawCreator: '',
        isParsed: false
    };
}

/**
 * Compiles a simple template string (e.g., "[Creator] - [Set]") into a regular expression.
 */
export function compileTemplateRegex(pattern: string): RegExp {
    const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\ -\\ /g, '(?:\\s+[-—–\\u2010-\\u2015\\uff0d]\\s+|\\s*[—–\\u2010-\\u2015\\uff0d]\\s*)')
        .replace(/\\\[Creator\\\]/g, '(?<creator>.+?)')
        .replace(/\\\[Set\\\]/g, '(?<set>.+)');
    return new RegExp(`^${regexPattern}$`);
}

/**
 * Converts a template placeholder format into a regex string representation.
 */
export function templateToRegex(template: string): string {
    return template
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\[Creator\\\]/g, '(?<creator>.+)')
        .replace(/\\\[Set\\\]/g, '(?<set>.+)');
}

/**
 * Converts a regex string back into a template placeholder format.
 */
export function regexToTemplate(regexStr: string): string {
    return regexStr
        .replace(/^\^/, '')
        .replace(/\$$/, '')
        .replace(/\(\?<creator>.*?\)/g, '[Creator]')
        .replace(/\(\?<set>.*?\)/g, '[Set]')
        .replace(/\\(.)/g, '$1');
}

/**
 * Parses a folder name using either an advanced regex pattern or a placeholder template,
 * falling back to Unicode dash splitting if unmatched.
 */
export function parseFolderNameWithPattern(
    folderName: string,
    pattern: string,
    advanced: boolean
): ParsedPatternResult {
    try {
        let regex: RegExp;
        if (advanced) {
            regex = new RegExp(pattern);
        } else {
            regex = compileTemplateRegex(pattern);
        }

        const match = folderName.match(regex);
        if (match && match.groups) {
            return {
                creator: match.groups.creator || 'Unknown',
                set: match.groups.set || 'Unknown',
                isValid: true
            };
        }
    } catch (e) {
        console.error("Regex error:", e);
    }

    const meta = parseFolderMetadata(folderName);
    if (meta.isParsed) {
        return {
            creator: meta.rawCreator || 'Unknown',
            set: meta.setTitle || 'Unknown',
            isValid: true
        };
    }

    return {
        creator: 'Unknown',
        set: 'Unknown',
        isValid: false
    };
}
