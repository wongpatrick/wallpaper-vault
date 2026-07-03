/**
 * @file
 * Navigation utility functions.
 * Helper functions for resolving routes, paths, and labels for breadcrumbs.
 */

/**
 * Resolves a friendly human-readable label from a URL pathname prefix.
 * Used for dynamic back-navigation button texts.
 * 
 * @param path The URL pathname string.
 * @returns A friendly label string.
 */
export function getLabelFromPath(path: string): string {
    if (!path || path === '/') return 'Dashboard';
    if (path.startsWith('/creators')) return 'Creators';
    if (path.startsWith('/sets')) return 'Sets';
    if (path.startsWith('/playlists')) return 'Playlists';
    if (path.startsWith('/images')) return 'Images';
    if (path.startsWith('/taxonomy')) return 'Taxonomy';
    if (path.startsWith('/tools')) return 'Tools';
    return 'Library';
}
