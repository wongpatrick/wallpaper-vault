/**
 * @file
 * Hook for guarding actions in read-only demo mode and displaying user feedback notifications.
 */
import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import { IS_DEMO_MODE } from '../config';

export function showDemoRestrictionNotification(customMessage?: string) {
    notifications.show({
        title: 'Demo Mode Restriction',
        message: customMessage || 'This state-modifying action is disabled in the read-only demo. Download the desktop app for full access.',
        color: 'blue',
        autoClose: 4000,
    });
}

export function useDemoGuard() {
    const isDemoMode = IS_DEMO_MODE;

    const guardAction = useCallback(
        <T extends (...args: unknown[]) => unknown>(
            action: T,
            customMessage?: string
        ): ((...args: Parameters<T>) => ReturnType<T> | void) => {
            return (...args: Parameters<T>) => {
                if (isDemoMode) {
                    showDemoRestrictionNotification(customMessage);
                    return;
                }
                return action(...args) as ReturnType<T>;
            };
        },
        [isDemoMode]
    );

    return {
        isDemoMode,
        guardAction,
        showDemoNotification: showDemoRestrictionNotification,
    };
}

export default useDemoGuard;
