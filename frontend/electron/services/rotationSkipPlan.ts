/**
 * @file
 * Pure helper for planning wallpaper skips across mixed DisplayFusion and native monitor configurations.
 */
import type { GlobalRotationConfig, MonitorRotationConfig } from './rotationCoordinator';

export interface SkipPlan {
    invokeDisplayFusion: boolean;
    nativeMonitors: number[];
}

export function planSkip(
    targetMonitor: string,
    globalConfig: GlobalRotationConfig,
    monitorConfigs: Map<number, MonitorRotationConfig>,
    displays: Array<{ index: number }>
): SkipPlan {
    if (targetMonitor === 'all') {
        if (displays.length === 0) {
            return {
                invokeDisplayFusion: globalConfig.mode === 'displayfusion',
                nativeMonitors: globalConfig.mode === 'native' ? [-1] : []
            };
        }

        let invokeDisplayFusion = false;
        const nativeMonitors: number[] = [];

        for (const display of displays) {
            const conf = monitorConfigs.get(display.index);
            const mode = conf && conf.enabled ? conf.mode : globalConfig.mode;

            if (mode === 'displayfusion') {
                invokeDisplayFusion = true;
            } else if (mode === 'native') {
                nativeMonitors.push(display.index);
            }
        }

        return {
            invokeDisplayFusion,
            nativeMonitors
        };
    }

    const index = parseInt(targetMonitor, 10);
    const conf = isNaN(index) ? undefined : monitorConfigs.get(index);
    const mode = conf && conf.enabled ? conf.mode : globalConfig.mode;

    if (mode === 'displayfusion') {
        return {
            invokeDisplayFusion: true,
            nativeMonitors: []
        };
    }

    return {
        invokeDisplayFusion: false,
        nativeMonitors: isNaN(index) ? [-1] : [index]
    };
}
