/**
 * @file
 * Tests for useLongPress hook.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLongPress } from './useLongPress';

describe('useLongPress', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('triggers click when press is shorter than delay', () => {
        const onLongPress = vi.fn();
        const onClick = vi.fn();

        const { result } = renderHook(() => useLongPress(onLongPress, onClick, { delay: 300 }));

        act(() => {
            result.current.onMouseDown({} as React.MouseEvent);
        });

        act(() => {
            vi.advanceTimersByTime(100);
            result.current.onMouseUp({} as React.MouseEvent);
        });

        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('triggers long press when held past delay, and suppresses click on release', () => {
        const onLongPress = vi.fn();
        const onClick = vi.fn();

        const { result } = renderHook(() => useLongPress(onLongPress, onClick, { delay: 300 }));

        act(() => {
            result.current.onMouseDown({} as React.MouseEvent);
        });

        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(onLongPress).toHaveBeenCalledTimes(1);

        act(() => {
            result.current.onMouseUp({} as React.MouseEvent);
        });

        expect(onClick).not.toHaveBeenCalled();
    });

    it('cancels timer and suppresses click on mouse leave', () => {
        const onLongPress = vi.fn();
        const onClick = vi.fn();

        const { result } = renderHook(() => useLongPress(onLongPress, onClick, { delay: 300 }));

        act(() => {
            result.current.onMouseDown({} as React.MouseEvent);
        });

        act(() => {
            vi.advanceTimersByTime(150);
            result.current.onMouseLeave({} as React.MouseEvent);
            vi.advanceTimersByTime(200);
        });

        expect(onLongPress).not.toHaveBeenCalled();
        expect(onClick).not.toHaveBeenCalled();
    });

    it('supports config object signature', () => {
        const onLongPress = vi.fn();
        const onClick = vi.fn();

        const { result } = renderHook(() => useLongPress({
            onLongPress,
            onClick,
            delay: 200
        }));

        act(() => {
            result.current.onTouchStart({} as React.TouchEvent);
        });

        act(() => {
            vi.advanceTimersByTime(250);
        });

        expect(onLongPress).toHaveBeenCalledTimes(1);

        const mockPreventDefault = vi.fn();
        act(() => {
            result.current.onTouchEnd({
                cancelable: true,
                preventDefault: mockPreventDefault
            } as unknown as React.TouchEvent);
        });

        expect(mockPreventDefault).toHaveBeenCalled();
        expect(onClick).not.toHaveBeenCalled();
    });

    it('returns stable memoized object when callbacks change', () => {
        let fn1 = () => {};
        const { result, rerender } = renderHook(() => useLongPress(fn1, fn1, { delay: 300 }));

        const initialHandlers = result.current;

        // Change callbacks in parent
        fn1 = () => {};
        rerender();

        expect(result.current).toBe(initialHandlers);
    });

    it('clears timeout on unmount', () => {
        const onLongPress = vi.fn();
        const { result, unmount } = renderHook(() => useLongPress(onLongPress, undefined, { delay: 300 }));

        act(() => {
            result.current.onMouseDown({} as React.MouseEvent);
        });

        unmount();

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(onLongPress).not.toHaveBeenCalled();
    });
});
