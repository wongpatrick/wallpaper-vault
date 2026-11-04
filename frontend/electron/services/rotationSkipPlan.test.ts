/**
 * @file
 * Tests for rotationSkipPlan helper.
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { planSkip } from './rotationSkipPlan';
import type { GlobalRotationConfig, MonitorRotationConfig } from './rotationCoordinator';

describe('rotationSkipPlan', () => {
    const baseGlobalConfig: GlobalRotationConfig = {
        mode: 'native',
        interval: 15,
        source: 'entire_library',
        playlistId: '',
        favoriteProbability: 0.4,
        style: 'fill',
        paused: false
    };

    const displays = [{ index: 0 }, { index: 1 }];

    it('handles "all" target when all monitors are in native mode', () => {
        const monitorConfigs = new Map<number, MonitorRotationConfig>();
        const plan = planSkip('all', baseGlobalConfig, monitorConfigs, displays);

        expect(plan.invokeDisplayFusion).toBe(false);
        expect(plan.nativeMonitors).toEqual([0, 1]);
    });

    it('handles "all" target when all monitors are in displayfusion mode', () => {
        const globalConfig: GlobalRotationConfig = { ...baseGlobalConfig, mode: 'displayfusion' };
        const monitorConfigs = new Map<number, MonitorRotationConfig>();
        const plan = planSkip('all', globalConfig, monitorConfigs, displays);

        expect(plan.invokeDisplayFusion).toBe(true);
        expect(plan.nativeMonitors).toEqual([]);
    });

    it('handles "all" target with mixed modes via monitor overrides', () => {
        const globalConfig: GlobalRotationConfig = { ...baseGlobalConfig, mode: 'native' };
        const monitorConfigs = new Map<number, MonitorRotationConfig>([
            [0, { mode: 'native', enabled: true, interval: 15, source: 'entire_library', playlistId: '', favoriteProbability: 0.4, style: 'fill' }],
            [1, { mode: 'displayfusion', enabled: true, interval: 15, source: 'entire_library', playlistId: '', favoriteProbability: 0.4, style: 'fill' }]
        ]);

        const plan = planSkip('all', globalConfig, monitorConfigs, displays);

        expect(plan.invokeDisplayFusion).toBe(true);
        expect(plan.nativeMonitors).toEqual([0]);
    });

    it('ignores disabled monitor overrides and falls back to global mode', () => {
        const globalConfig: GlobalRotationConfig = { ...baseGlobalConfig, mode: 'displayfusion' };
        const monitorConfigs = new Map<number, MonitorRotationConfig>([
            [0, { mode: 'native', enabled: false, interval: 15, source: 'entire_library', playlistId: '', favoriteProbability: 0.4, style: 'fill' }]
        ]);

        const plan = planSkip('all', globalConfig, monitorConfigs, displays);

        expect(plan.invokeDisplayFusion).toBe(true);
        expect(plan.nativeMonitors).toEqual([]);
    });

    it('handles empty displays list fallback on "all"', () => {
        const nativePlan = planSkip('all', { ...baseGlobalConfig, mode: 'native' }, new Map(), []);
        expect(nativePlan.invokeDisplayFusion).toBe(false);
        expect(nativePlan.nativeMonitors).toEqual([-1]);

        const dfPlan = planSkip('all', { ...baseGlobalConfig, mode: 'displayfusion' }, new Map(), []);
        expect(dfPlan.invokeDisplayFusion).toBe(true);
        expect(dfPlan.nativeMonitors).toEqual([]);
    });

    it('handles single monitor target in displayfusion mode', () => {
        const monitorConfigs = new Map<number, MonitorRotationConfig>([
            [1, { mode: 'displayfusion', enabled: true, interval: 15, source: 'entire_library', playlistId: '', favoriteProbability: 0.4, style: 'fill' }]
        ]);

        const plan = planSkip('1', baseGlobalConfig, monitorConfigs, displays);

        expect(plan.invokeDisplayFusion).toBe(true);
        expect(plan.nativeMonitors).toEqual([]);
    });

    it('handles single monitor target in native mode', () => {
        const monitorConfigs = new Map<number, MonitorRotationConfig>([
            [1, { mode: 'native', enabled: true, interval: 15, source: 'entire_library', playlistId: '', favoriteProbability: 0.4, style: 'fill' }]
        ]);

        const plan = planSkip('1', { ...baseGlobalConfig, mode: 'displayfusion' }, monitorConfigs, displays);

        expect(plan.invokeDisplayFusion).toBe(false);
        expect(plan.nativeMonitors).toEqual([1]);
    });
});
