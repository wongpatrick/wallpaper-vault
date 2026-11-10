/**
 * @file
 * Shared Electron path resolution helpers.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolves the `public` assets directory for both dev and packaged Electron builds.
 * Checks `../public` first (bundled `dist-electron/main.js`) and falls back to
 * `../../public` when imported unbundled (e.g., from `electron/services/` in unit tests).
 */
export function resolvePublicDir(dirname: string): string {
    if (process.env.VITE_DEV_SERVER_URL) {
        const bundledPublicDir = path.resolve(dirname, '..', 'public');
        if (fs.existsSync(bundledPublicDir)) {
            return bundledPublicDir;
        }

        const unbundledPublicDir = path.resolve(dirname, '../../public');
        if (fs.existsSync(unbundledPublicDir)) {
            return unbundledPublicDir;
        }

        return bundledPublicDir;
    }

    return path.join(process.resourcesPath, 'public');
}
