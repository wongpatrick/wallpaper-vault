/**
 * @file
 * Tests for useSidebarResizer hook and computeSnappedWidth helper.
 */
/* eslint-disable no-magic-numbers */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarResizer, computeSnappedWidth, COLLAPSED_WIDTH, EXPANDED_DEFAULT_WIDTH } from './useSidebarResizer';

describe('useSidebarResizer', () => {
    beforeEach(() => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('computeSnappedWidth', () => {
        it('snaps below threshold to COLLAPSED_WIDTH', () => {
            expect(computeSnappedWidth(100)).toBe(COLLAPSED_WIDTH);
            expect(computeSnappedWidth(149)).toBe(COLLAPSED_WIDTH);
        });

        it('snaps within threshold range to EXPANDED_DEFAULT_WIDTH', () => {
            expect(computeSnappedWidth(150)).toBe(EXPANDED_DEFAULT_WIDTH);
            expect(computeSnappedWidth(250)).toBe(EXPANDED_DEFAULT_WIDTH);
            expect(computeSnappedWidth(329)).toBe(EXPANDED_DEFAULT_WIDTH);
        });

        it('preserves widths beyond snap threshold', () => {
            expect(computeSnappedWidth(350)).toBe(350);
            expect(computeSnappedWidth(400)).toBe(400);
        });
    });

    describe('hook lifecycle and listeners', () => {
        it('does not attach mousemove/mouseup listeners before drag begins', () => {
            const addSpy = vi.spyOn(window, 'addEventListener');
            renderHook(() => useSidebarResizer());

            const mouseMoveCalls = addSpy.mock.calls.filter(([event]) => event === 'mousemove');
            const mouseUpCalls = addSpy.mock.calls.filter(([event]) => event === 'mouseup');

            expect(mouseMoveCalls.length).toBe(0);
            expect(mouseUpCalls.length).toBe(0);
        });

        it('attaches listeners and sets body styles on startResizing, removes them on stopResizing', () => {
            const addSpy = vi.spyOn(window, 'addEventListener');
            const removeSpy = vi.spyOn(window, 'removeEventListener');

            const { result } = renderHook(() => useSidebarResizer());

            act(() => {
                result.current.startResizing();
            });

            expect(result.current.isResizing).toBe(true);
            expect(document.body.style.cursor).toBe('col-resize');
            expect(document.body.style.userSelect).toBe('none');

            expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
            expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));

            // Simulate mouse move
            act(() => {
                window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
            });
            expect(result.current.width).toBe(200);

            // Stop resizing
            act(() => {
                window.dispatchEvent(new MouseEvent('mouseup'));
            });

            expect(result.current.isResizing).toBe(false);
            expect(document.body.style.cursor).toBe('');
            expect(document.body.style.userSelect).toBe('');
            expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
            expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
        });

        it('cleans up body styles and listeners on unmount even mid-drag', () => {
            const removeSpy = vi.spyOn(window, 'removeEventListener');
            const { result, unmount } = renderHook(() => useSidebarResizer());

            act(() => {
                result.current.startResizing();
            });
            expect(document.body.style.cursor).toBe('col-resize');

            unmount();

            expect(document.body.style.cursor).toBe('');
            expect(document.body.style.userSelect).toBe('');
            expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
            expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
        });

        it('clamps resizing between MIN_WIDTH and MAX_WIDTH', () => {
            const { result } = renderHook(() => useSidebarResizer());

            act(() => {
                result.current.startResizing();
            });

            act(() => {
                window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50 }));
            });
            // 50 is less than MIN_WIDTH (80), width should not change
            expect(result.current.width).toBe(EXPANDED_DEFAULT_WIDTH);

            act(() => {
                window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 }));
            });
            // 500 is greater than MAX_WIDTH (400), width should not change
            expect(result.current.width).toBe(EXPANDED_DEFAULT_WIDTH);

            act(() => {
                window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 }));
            });
            expect(result.current.width).toBe(300);
        });
    });
});
