/**
 * @file
 * Tests for DisplayFusion integration service.
 */
/* eslint-disable no-magic-numbers, @typescript-eslint/no-explicit-any */
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { DisplayFusionService } from './displayFusion';

describe('DisplayFusionService', () => {
    it('returns unsupported status on non-Windows platforms', async () => {
        const service = new DisplayFusionService({
            platform: 'darwin',
            fileExists: vi.fn().mockResolvedValue(true)
        });

        const status = await service.getStatus();
        expect(status.supported).toBe(false);
        expect(status.installed).toBe(false);
        expect(status.running).toBe(false);
        expect(status.exePath).toBeNull();
        expect(status.source).toBeNull();
    });

    it('resolves custom path first if valid', async () => {
        const fileExistsMock = vi.fn(async (p: string) => p === 'D:\\Custom\\DisplayFusionCommand.exe');
        const service = new DisplayFusionService({
            platform: 'win32',
            fileExists: fileExistsMock,
            getCustomPath: vi.fn().mockResolvedValue('D:\\Custom\\DisplayFusionCommand.exe')
        });

        const status = await service.getStatus();
        expect(status.supported).toBe(true);
        expect(status.installed).toBe(true);
        expect(status.exePath).toBe('D:\\Custom\\DisplayFusionCommand.exe');
        expect(status.source).toBe('custom');
    });

    it('falls back to registry if custom path is absent or missing', async () => {
        const fileExistsMock = vi.fn(async (p: string) => p.includes('C:\\DisplayFusionInstalled\\DisplayFusionCommand.exe'));
        const service = new DisplayFusionService({
            platform: 'win32',
            fileExists: fileExistsMock,
            getCustomPath: vi.fn().mockResolvedValue(null),
            runPowerShell: vi.fn().mockResolvedValue('C:\\DisplayFusionInstalled')
        });

        const status = await service.getStatus();
        expect(status.supported).toBe(true);
        expect(status.installed).toBe(true);
        expect(status.exePath).toBe('C:\\DisplayFusionInstalled\\DisplayFusionCommand.exe');
        expect(status.source).toBe('registry');
    });

    it('falls back to default path when custom and registry are unavailable', async () => {
        const fileExistsMock = vi.fn(async (p: string) => p === 'C:\\Program Files\\DisplayFusion\\DisplayFusionCommand.exe');
        const service = new DisplayFusionService({
            platform: 'win32',
            fileExists: fileExistsMock,
            getCustomPath: vi.fn().mockResolvedValue(null),
            runPowerShell: vi.fn().mockResolvedValue('')
        });

        const status = await service.getStatus();
        expect(status.installed).toBe(true);
        expect(status.exePath).toBe('C:\\Program Files\\DisplayFusion\\DisplayFusionCommand.exe');
        expect(status.source).toBe('default');
    });

    it('reports not installed when no executable is found', async () => {
        const service = new DisplayFusionService({
            platform: 'win32',
            fileExists: vi.fn().mockResolvedValue(false),
            getCustomPath: vi.fn().mockResolvedValue(null),
            runPowerShell: vi.fn().mockResolvedValue('')
        });

        const status = await service.getStatus();
        expect(status.installed).toBe(false);
        expect(status.exePath).toBeNull();
        expect(status.source).toBeNull();
    });

    it('reports running state correctly based on process detection', async () => {
        const serviceRunning = new DisplayFusionService({
            platform: 'win32',
            fileExists: vi.fn().mockResolvedValue(false),
            runPowerShell: vi.fn().mockResolvedValue('True')
        });
        expect(await serviceRunning.isRunning()).toBe(true);

        const serviceNotRunning = new DisplayFusionService({
            platform: 'win32',
            fileExists: vi.fn().mockResolvedValue(false),
            runPowerShell: vi.fn().mockResolvedValue('False')
        });
        expect(await serviceNotRunning.isRunning()).toBe(false);
    });

    it('executes nextImage command with timeout and arguments', async () => {
        const execFileMock = vi.fn((file, args, opts, cb) => {
            cb(null, 'OK', '');
        });
        const logMock = vi.fn();

        const service = new DisplayFusionService({
            platform: 'win32',
            fileExists: vi.fn().mockResolvedValue(true),
            getCustomPath: vi.fn().mockResolvedValue('C:\\DF\\DisplayFusionCommand.exe'),
            execFile: execFileMock as any,
            log: logMock
        });

        const success = await service.nextImage();
        expect(success).toBe(true);
        expect(execFileMock).toHaveBeenCalledWith(
            'C:\\DF\\DisplayFusionCommand.exe',
            ['-WallpaperNextImage'],
            expect.objectContaining({ timeout: 10000, windowsHide: true }),
            expect.any(Function)
        );
    });

    it('throttles failure notifications to at most once per 60 seconds', async () => {
        let currentTime = 100000;
        const notifyMock = vi.fn();
        const execFileMock = vi.fn((file, args, opts, cb) => {
            cb(new Error('Process terminated with error code 1'), '', 'error');
        });

        const service = new DisplayFusionService({
            platform: 'win32',
            fileExists: vi.fn().mockResolvedValue(true),
            getCustomPath: vi.fn().mockResolvedValue('C:\\DF\\DisplayFusionCommand.exe'),
            execFile: execFileMock as any,
            showNotification: notifyMock,
            now: () => currentTime,
            log: vi.fn()
        });

        // 1st failure -> notifies
        const res1 = await service.nextImage();
        expect(res1).toBe(false);
        expect(notifyMock).toHaveBeenCalledTimes(1);

        // 2nd failure 10s later -> throttled (no additional notification)
        currentTime += 10000;
        const res2 = await service.nextImage();
        expect(res2).toBe(false);
        expect(notifyMock).toHaveBeenCalledTimes(1);

        // 3rd failure 65s later -> notifies again
        currentTime += 65000;
        const res3 = await service.nextImage();
        expect(res3).toBe(false);
        expect(notifyMock).toHaveBeenCalledTimes(2);
    });

    it('invalidates cached resolution when requested', async () => {
        let customPath = 'C:\\DF1\\DisplayFusionCommand.exe';
        const fileExistsMock = vi.fn(async (p: string) => p === customPath);

        const service = new DisplayFusionService({
            platform: 'win32',
            fileExists: fileExistsMock,
            getCustomPath: async () => customPath
        });

        const status1 = await service.getStatus();
        expect(status1.exePath).toBe('C:\\DF1\\DisplayFusionCommand.exe');

        // Change custom path, but cache still holds old path
        customPath = 'C:\\DF2\\DisplayFusionCommand.exe';

        // After invalidating, new path is resolved
        service.invalidate();
        const status2 = await service.getStatus();
        expect(status2.exePath).toBe('C:\\DF2\\DisplayFusionCommand.exe');
    });
});
