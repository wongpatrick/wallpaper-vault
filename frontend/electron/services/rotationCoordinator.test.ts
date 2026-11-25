/**
 * @file
 * Tests for RotationCoordinator service.
 */
/* eslint-disable no-magic-numbers, @typescript-eslint/no-explicit-any */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { RotationCoordinator } from './rotationCoordinator';
import * as monitorLayout from './monitorLayout';

describe('RotationCoordinator', () => {
    let mockContext: any;
    let mockDisplays: any[];

    beforeEach(() => {
        vi.useFakeTimers();

        mockDisplays = [
            {
                index: 0,
                winNum: 1,
                id: 1,
                label: 'Monitor 1',
                bounds: { x: 0, y: 0, width: 1920, height: 1080 }
            },
            {
                index: 1,
                winNum: 2,
                id: 2,
                label: 'Monitor 2',
                bounds: { x: 1920, y: 0, width: 1920, height: 1080 }
            }
        ];

        vi.spyOn(monitorLayout, 'getOrderedDisplays').mockResolvedValue(mockDisplays);
        vi.spyOn(monitorLayout, 'getPowerStateSuspended').mockReturnValue(false);

        mockContext = {
            getMainWindow: vi.fn(),
            getBackendPort: vi.fn().mockReturnValue(8000),
            isQuitting: vi.fn().mockReturnValue(false),
            setQuitting: vi.fn(),
            logToCombined: vi.fn().mockResolvedValue(undefined)
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('multi-monitor timer inheritance: spawns timer for non-overridden monitors inheriting global native mode', async () => {
        const coordinator = new RotationCoordinator(mockContext);

        // Configure global mode as native, 15 min interval
        (coordinator as any).globalRotationConfig = {
            mode: 'native',
            interval: 15,
            source: 'entire_library',
            playlistId: '',
            favoriteProbability: 0.4,
            style: 'fill',
            paused: false
        };

        // Monitor 0 has an override: mode is displayfusion (not native)
        // Monitor 1 has NO override (enabled: false) -> should inherit global native mode!
        (coordinator as any).monitorConfigs = new Map([
            [
                0,
                {
                    enabled: true,
                    mode: 'displayfusion',
                    interval: 10,
                    source: 'entire_library',
                    playlistId: '',
                    favoriteProbability: 0.4,
                    style: 'fill'
                }
            ],
            [
                1,
                {
                    enabled: false,
                    mode: 'displayfusion', // overridden value ignored when enabled is false
                    interval: 10,
                    source: 'entire_library',
                    playlistId: '',
                    favoriteProbability: 0.4,
                    style: 'fill'
                }
            ]
        ]);

        const triggerSpy = vi.spyOn(coordinator, 'triggerNativeRotation').mockResolvedValue(undefined);

        const setupPromise = coordinator.setupNativeTimers(8000);
        // Fast-forward debounce timer (300ms)
        vi.advanceTimersByTime(350);
        await setupPromise;

        const timers = (coordinator as any).nativeRotationTimers as Map<number, any>;
        // Monitor 0 should NOT have a native timer (it uses displayfusion)
        expect(timers.has(0)).toBe(false);
        // Monitor 1 MUST have a native timer (inherited global native mode)
        expect(timers.has(1)).toBe(true);

        // Advance 15 minutes
        vi.advanceTimersByTime(15 * 60 * 1000);
        expect(triggerSpy).toHaveBeenCalledWith(8000, 1);
        expect(triggerSpy).not.toHaveBeenCalledWith(8000, 0);

        coordinator.stop();
    });

    it('spawns dedicated timers for all displays when no overrides exist and global mode is native', async () => {
        const coordinator = new RotationCoordinator(mockContext);

        (coordinator as any).globalRotationConfig = {
            mode: 'native',
            interval: 20,
            source: 'entire_library',
            playlistId: '',
            favoriteProbability: 0.4,
            style: 'fill',
            paused: false
        };

        (coordinator as any).monitorConfigs = new Map();

        const triggerSpy = vi.spyOn(coordinator, 'triggerNativeRotation').mockResolvedValue(undefined);

        const setupPromise = coordinator.setupNativeTimers(8000);
        vi.advanceTimersByTime(350);
        await setupPromise;

        const timers = (coordinator as any).nativeRotationTimers as Map<number, any>;
        expect(timers.has(0)).toBe(true);
        expect(timers.has(1)).toBe(true);

        vi.advanceTimersByTime(20 * 60 * 1000);
        expect(triggerSpy).toHaveBeenCalledWith(8000, 0);
        expect(triggerSpy).toHaveBeenCalledWith(8000, 1);

        coordinator.stop();
    });

    it('flushes pending triggers and active timers on stop()', async () => {
        const coordinator = new RotationCoordinator(mockContext);
        (coordinator as any).pendingTriggerMonitors.add(0);
        (coordinator as any).pendingTriggerMonitors.add(1);

        coordinator.stop();

        expect((coordinator as any).pendingTriggerMonitors.size).toBe(0);
        expect((coordinator as any).nativeRotationTimers.size).toBe(0);
    });

    it('debounces rapid-fire setupNativeTimers calls into a single execution', async () => {
        const coordinator = new RotationCoordinator(mockContext);
        const executeSpy = vi.spyOn(coordinator as any, 'executeSetupNativeTimers').mockResolvedValue(undefined);

        void coordinator.setupNativeTimers(8000);
        void coordinator.setupNativeTimers(8000);
        void coordinator.setupNativeTimers(8000);

        expect(executeSpy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(350);
        expect(executeSpy).toHaveBeenCalledTimes(1);

        coordinator.stop();
    });

    it('start with force reconnects even if activeSsePort matches', async () => {
        const coordinator = new RotationCoordinator(mockContext);
        vi.spyOn(coordinator, 'fetchRotationSettings').mockResolvedValue(true);

        // Pre-set active port as 8000
        (coordinator as any).activeSsePort = 8000;
        (coordinator as any).activeSseRequest = {
            destroyed: false,
            destroy: vi.fn()
        };

        const http = await import('node:http');
        const mockReq = new EventEmitter() as any;
        mockReq.destroy = vi.fn();
        const getSpy = vi.spyOn(http.default, 'get').mockReturnValue(mockReq);

        // Calling start without force when active should early-return
        coordinator.start(8000, false);
        expect(getSpy).not.toHaveBeenCalled();

        // Calling start with force should reconnect
        coordinator.start(8000, true);
        await vi.runAllTimersAsync();
        expect(getSpy).toHaveBeenCalled();

        coordinator.stop();
    });
});
