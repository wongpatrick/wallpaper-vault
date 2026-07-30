/**
 * @file Electron monitor query hook for rotation management.
 */
/* eslint-disable no-magic-numbers */
import { useState, useEffect } from 'react';
import type { MonitorInfo } from '../../../types/electron';

export type { MonitorInfo };

export function useMonitors() {
    const [monitors, setMonitors] = useState<MonitorInfo[]>([]);

    useEffect(() => {
        let isMounted = true;

        const fetchMonitors = () => {
            if (window.electron?.getMonitors) {
                window.electron.getMonitors().then((res) => {
                    if (isMounted) {
                        setMonitors(res);
                    }
                });
            }
        };
        fetchMonitors();

        let unsubscribe: (() => void) | undefined;
        if (window.electron?.onDisplaysChanged) {
            unsubscribe = window.electron.onDisplaysChanged(() => {
                fetchMonitors();
            });
        }

        return () => {
            isMounted = false;
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, []);

    return { monitors };
}
