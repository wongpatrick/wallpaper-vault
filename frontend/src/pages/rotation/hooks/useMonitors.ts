/**
 * @file Electron monitor query hook for rotation management.
 */
import { useState, useEffect, useCallback } from 'react';
import type { MonitorInfo } from '../../../types/electron';

export type { MonitorInfo };

export interface UseMonitorsResult {
    monitors: MonitorInfo[];
    refreshMonitors: () => Promise<MonitorInfo[]>;
    isRefreshing: boolean;
}

export function useMonitors(): UseMonitorsResult {
    const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

    const fetchMonitors = useCallback(async (forceRefresh = false): Promise<MonitorInfo[]> => {
        if (!window.electron?.getMonitors) {
            return [];
        }
        if (forceRefresh) {
            setIsRefreshing(true);
        }
        try {
            const res = await window.electron.getMonitors(forceRefresh);
            setMonitors(res);
            return res;
        } finally {
            if (forceRefresh) {
                setIsRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        let isMounted = true;

        const load = () => {
            if (window.electron?.getMonitors) {
                window.electron.getMonitors().then((res) => {
                    if (isMounted) {
                        setMonitors(res);
                    }
                });
            }
        };
        load();

        let unsubscribe: (() => void) | undefined;
        if (window.electron?.onDisplaysChanged) {
            unsubscribe = window.electron.onDisplaysChanged(() => {
                load();
            });
        }

        return () => {
            isMounted = false;
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, []);

    const refreshMonitors = useCallback(async () => {
        return await fetchMonitors(true);
    }, [fetchMonitors]);

    return { monitors, refreshMonitors, isRefreshing };
}
