/**
 * @file
 * Unit tests for useMonitors hook.
 * Tests monitor fetching on mount, event-driven hot-plug invalidation, and manual layout refresh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMonitors } from './useMonitors';

describe('useMonitors Hook', () => {
    const mockMonitors = [
        { index: 0, winNum: 1, id: 1, label: 'Monitor 1 (1920x1080)', bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { index: 1, winNum: 2, id: 2, label: 'Monitor 2 (2560x1440)', bounds: { x: 1920, y: 0, width: 2560, height: 1440 } }
    ];

    let displayChangeCallback: (() => void) | null = null;
    let unsubscribeMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        displayChangeCallback = null;
        unsubscribeMock = vi.fn();

        vi.stubGlobal('electron', {
            getMonitors: vi.fn().mockImplementation((forceRefresh?: boolean) => {
                if (forceRefresh) {
                    return Promise.resolve([
                        ...mockMonitors,
                        { index: 2, winNum: 3, id: 3, label: 'Monitor 3 (3840x2160)', bounds: { x: 4480, y: 0, width: 3840, height: 2160 } }
                    ]);
                }
                return Promise.resolve(mockMonitors);
            }),
            onDisplaysChanged: vi.fn().mockImplementation((callback: () => void) => {
                displayChangeCallback = callback;
                return unsubscribeMock;
            })
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches monitors on initial mount', async () => {
        const { result } = renderHook(() => useMonitors());

        await waitFor(() => {
            expect(result.current.monitors).toHaveLength(2);
            expect(result.current.monitors[0].label).toBe('Monitor 1 (1920x1080)');
        });
    });

    it('re-fetches monitors when onDisplaysChanged event fires', async () => {
        const { result } = renderHook(() => useMonitors());

        await waitFor(() => {
            expect(result.current.monitors).toHaveLength(2);
        });

        // Simulate a new monitor plugged in and display event fired
        const updatedMonitors = [
            ...mockMonitors,
            { index: 2, winNum: 3, id: 3, label: 'Monitor 3 (3840x2160)', bounds: { x: 4480, y: 0, width: 3840, height: 2160 } }
        ];
        (window.electron.getMonitors as ReturnType<typeof vi.fn>).mockResolvedValue(updatedMonitors);

        act(() => {
            if (displayChangeCallback) {
                displayChangeCallback();
            }
        });

        await waitFor(() => {
            expect(result.current.monitors).toHaveLength(3);
            expect(result.current.monitors[2].id).toBe(3);
        });
    });

    it('unsubscribes from onDisplaysChanged on unmount', () => {
        const { unmount } = renderHook(() => useMonitors());
        expect(window.electron.onDisplaysChanged).toHaveBeenCalledTimes(1);

        unmount();
        expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    });

    it('triggers manual refresh with forceRefresh flag and tracks isRefreshing state', async () => {
        const { result } = renderHook(() => useMonitors());

        await waitFor(() => {
            expect(result.current.monitors).toHaveLength(2);
            expect(result.current.isRefreshing).toBe(false);
        });

        let refreshPromise: Promise<unknown>;
        act(() => {
            refreshPromise = result.current.refreshMonitors();
        });

        await waitFor(() => {
            expect(window.electron.getMonitors).toHaveBeenCalledWith(true);
        });

        await act(async () => {
            await refreshPromise;
        });

        expect(result.current.monitors).toHaveLength(3);
        expect(result.current.isRefreshing).toBe(false);
    });

    it('handles non-electron environments gracefully without error', async () => {
        vi.stubGlobal('electron', undefined);

        const { result } = renderHook(() => useMonitors());

        expect(result.current.monitors).toEqual([]);
        expect(result.current.isRefreshing).toBe(false);

        await act(async () => {
            const res = await result.current.refreshMonitors();
            expect(res).toEqual([]);
        });
    });
});
