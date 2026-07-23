/**
 * @file Electron monitor query hook for rotation management.
 */
/* eslint-disable no-magic-numbers */
import { useState, useEffect } from 'react';

export interface MonitorInfo {
    index: number;
    winNum?: number;
    id: number;
    label: string;
    bounds: { width: number; height: number; x: number; y: number; };
}

export function useMonitors() {
    const [monitors, setMonitors] = useState<MonitorInfo[]>([]);

    useEffect(() => {
        const fetchMonitors = () => {
            if (window.electron?.getMonitors) {
                window.electron.getMonitors().then((res) => {
                    setMonitors(res);
                });
            }
        };
        fetchMonitors();

        if (window.electron?.on) {
            const unsubscribe = window.electron.on('displays-changed', () => {
                fetchMonitors();
            });
            return unsubscribe;
        }
    }, []);

    return { monitors };
}
