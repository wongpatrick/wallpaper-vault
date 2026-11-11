/**
 * @file
 * Unit tests for resolvePublicDir and TrayManager icon loading and resizing.
 */
/* eslint-disable no-magic-numbers */
// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from './appContext';
import type { RotationCoordinator } from './rotationCoordinator';

const {
    trayConstructorSpy,
    traySetToolTipSpy,
    traySetContextMenuSpy,
    trayOnSpy,
    trayDestroySpy,
    menuBuildFromTemplateSpy,
    getPrimaryDisplaySpy,
    createFromBufferSpy,
    createFromPathSpy,
    createFromDataURLSpy,
    createEmptySpy,
} = vi.hoisted(() => ({
    trayConstructorSpy: vi.fn(),
    traySetToolTipSpy: vi.fn(),
    traySetContextMenuSpy: vi.fn(),
    trayOnSpy: vi.fn(),
    trayDestroySpy: vi.fn(),
    menuBuildFromTemplateSpy: vi.fn(() => ({})),
    getPrimaryDisplaySpy: vi.fn(() => ({ scaleFactor: 1 })),
    createFromBufferSpy: vi.fn(),
    createFromPathSpy: vi.fn(),
    createFromDataURLSpy: vi.fn(),
    createEmptySpy: vi.fn(),
}));

vi.mock('electron', () => {
    class MockTray {
        constructor(icon: unknown) {
            trayConstructorSpy(icon);
        }
        setToolTip = traySetToolTipSpy;
        setContextMenu = traySetContextMenuSpy;
        on = trayOnSpy;
        destroy = trayDestroySpy;
    }

    return {
        app: {
            quit: vi.fn(),
        },
        Tray: MockTray,
        Menu: {
            buildFromTemplate: menuBuildFromTemplateSpy,
        },
        nativeImage: {
            createFromBuffer: createFromBufferSpy,
            createFromPath: createFromPathSpy,
            createFromDataURL: createFromDataURLSpy,
            createEmpty: createEmptySpy,
        },
        screen: {
            getPrimaryDisplay: getPrimaryDisplaySpy,
        },
    };
});

import { resolvePublicDir } from '../utils/paths';
import { TrayManager } from './trayManager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '../..');
const expectedPublicDir = path.join(frontendRoot, 'public');

function createMockNativeImage(label: string, empty = false) {
    const image = {
        label,
        isEmpty: () => empty,
        resize: vi.fn((opts: { width: number; height: number; quality?: string }) => ({
            label: `${label}:${opts.width}x${opts.height}`,
            isEmpty: () => false,
            resize: vi.fn(),
            resizedWith: opts,
        })),
    };
    return image;
}

describe('resolvePublicDir', () => {
    const originalViteDevUrl = process.env.VITE_DEV_SERVER_URL;
    const originalResourcesPath = process.resourcesPath;

    afterEach(() => {
        if (originalViteDevUrl === undefined) {
            delete process.env.VITE_DEV_SERVER_URL;
        } else {
            process.env.VITE_DEV_SERVER_URL = originalViteDevUrl;
        }
        Object.defineProperty(process, 'resourcesPath', {
            value: originalResourcesPath,
            configurable: true,
        });
    });

    it('resolves frontend/public in dev mode when bundled into dist-electron', () => {
        process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
        const distElectronDir = path.join(frontendRoot, 'dist-electron');

        const resolved = resolvePublicDir(distElectronDir);

        expect(resolved).toBe(expectedPublicDir);
        expect(fs.existsSync(path.join(resolved, 'vault-tray.png'))).toBe(true);
    });

    it('resolves frontend/public in dev mode when imported unbundled from electron/services', () => {
        process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';

        const resolved = resolvePublicDir(__dirname);

        expect(resolved).toBe(expectedPublicDir);
        expect(fs.existsSync(path.join(resolved, 'vault-tray.png'))).toBe(true);
    });

    it('resolves process.resourcesPath/public in packaged builds', () => {
        delete process.env.VITE_DEV_SERVER_URL;
        const fakeResourcesPath = path.join(frontendRoot, 'fake-resources');
        Object.defineProperty(process, 'resourcesPath', {
            value: fakeResourcesPath,
            configurable: true,
        });

        const resolved = resolvePublicDir(__dirname);

        expect(resolved).toBe(path.join(fakeResourcesPath, 'public'));
    });
});

describe('TrayManager', () => {
    const originalViteDevUrl = process.env.VITE_DEV_SERVER_URL;

    let mockContext: AppContext;
    let mockCoordinator: RotationCoordinator;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';

        mockContext = {
            getMainWindow: vi.fn(() => null),
            getBackendPort: vi.fn(() => 8000),
            isQuitting: vi.fn(() => false),
            setQuitting: vi.fn(),
            logToCombined: vi.fn(),
        };

        mockCoordinator = {
            setMenuUpdateCallback: vi.fn(),
            isPaused: vi.fn(() => false),
            getActiveMonitorWallpapers: vi.fn(() => new Map()),
            triggerSkipViaApi: vi.fn(),
            togglePauseStateViaApi: vi.fn(),
        } as unknown as RotationCoordinator;

        getPrimaryDisplaySpy.mockReturnValue({ scaleFactor: 1 });
        createFromBufferSpy.mockReturnValue(createMockNativeImage('from-buffer', true));
        createEmptySpy.mockReturnValue(createMockNativeImage('empty', true));
        createFromPathSpy.mockReturnValue(createMockNativeImage('from-path', true));
        createFromDataURLSpy.mockReturnValue(createMockNativeImage('from-data-url', true));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (originalViteDevUrl === undefined) {
            delete process.env.VITE_DEV_SERVER_URL;
        } else {
            process.env.VITE_DEV_SERVER_URL = originalViteDevUrl;
        }
    });

    it('loads vault-tray.png first and resizes to 16x16 on standard DPI displays', async () => {
        const readFileSpy = vi.spyOn(fs.promises, 'readFile');
        const loadedImage = createMockNativeImage('vault-tray');
        createFromBufferSpy.mockReturnValueOnce(loadedImage);

        const manager = new TrayManager(mockContext, mockCoordinator);
        await manager.create();

        expect(readFileSpy).toHaveBeenCalledTimes(1);
        expect(readFileSpy).toHaveBeenCalledWith(path.join(expectedPublicDir, 'vault-tray.png'));
        expect(loadedImage.resize).toHaveBeenCalledWith({
            width: 16,
            height: 16,
            quality: 'best',
        });
        expect(trayConstructorSpy).toHaveBeenCalledWith(
            expect.objectContaining({ label: 'vault-tray:16x16' })
        );
        expect(traySetToolTipSpy).toHaveBeenCalledWith('Wallpaper Vault');
    });

    it('resizes tray icon to 32x32 on HiDPI displays', async () => {
        getPrimaryDisplaySpy.mockReturnValue({ scaleFactor: 1.5 });
        const loadedImage = createMockNativeImage('vault-tray');
        createFromBufferSpy.mockReturnValueOnce(loadedImage);

        const manager = new TrayManager(mockContext, mockCoordinator);
        await manager.create();

        expect(loadedImage.resize).toHaveBeenCalledWith({
            width: 32,
            height: 32,
            quality: 'best',
        });
        expect(trayConstructorSpy).toHaveBeenCalledWith(
            expect.objectContaining({ label: 'vault-tray:32x32' })
        );
    });

    it('falls back to vault-icon.png if vault-tray.png cannot be read', async () => {
        const readFileSpy = vi.spyOn(fs.promises, 'readFile')
            .mockRejectedValueOnce(new Error('ENOENT'))
            .mockResolvedValueOnce(Buffer.from('fake-png'));

        const fallbackImage = createMockNativeImage('vault-icon');
        createFromBufferSpy.mockReturnValueOnce(fallbackImage);

        const manager = new TrayManager(mockContext, mockCoordinator);
        await manager.create();

        expect(readFileSpy).toHaveBeenNthCalledWith(1, path.join(expectedPublicDir, 'vault-tray.png'));
        expect(readFileSpy).toHaveBeenNthCalledWith(2, path.join(expectedPublicDir, 'vault-icon.png'));
        expect(trayConstructorSpy).toHaveBeenCalledWith(
            expect.objectContaining({ label: 'vault-icon:16x16' })
        );
    });

    it('uses empty fallback without resizing when no icon can be decoded', async () => {
        vi.spyOn(fs.promises, 'readFile').mockRejectedValue(new Error('ENOENT'));
        const emptyImage = createMockNativeImage('empty', true);
        createEmptySpy.mockReturnValue(emptyImage);

        const manager = new TrayManager(mockContext, mockCoordinator);
        await manager.create();

        expect(createEmptySpy).toHaveBeenCalledTimes(1);
        expect(emptyImage.resize).not.toHaveBeenCalled();
        expect(trayConstructorSpy).toHaveBeenCalledWith(emptyImage);
    });
});
