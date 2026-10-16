/**
 * @file
 * React hook managing drag-to-resize sidebar functionality.
 * Controls sidebar width, snapping, and drag-scoped resize event listeners.
 */
import { useState, useCallback, useEffect, useRef } from 'react';

export const MIN_WIDTH = 80;
export const MAX_WIDTH = 400;
export const COLLAPSED_WIDTH = 80;
export const EXPANDED_DEFAULT_WIDTH = 280;
export const SNAP_THRESHOLD = 150;
export const SNAP_THRESHOLD_PX = 50;

/**
 * Pure helper to compute snapped sidebar width based on configured thresholds.
 */
export function computeSnappedWidth(rawWidth: number): number {
    if (rawWidth < SNAP_THRESHOLD) {
        return COLLAPSED_WIDTH;
    }
    if (rawWidth < EXPANDED_DEFAULT_WIDTH + SNAP_THRESHOLD_PX) {
        return EXPANDED_DEFAULT_WIDTH;
    }
    return rawWidth;
}

export function useSidebarResizer() {
    const [width, setWidth] = useState(EXPANDED_DEFAULT_WIDTH);
    const [isResizing, setIsResizing] = useState(false);
    const isResizingRef = useRef(false);

    const resize = useCallback((e: MouseEvent) => {
        const newWidth = e.clientX;
        if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
            setWidth(newWidth);
        }
    }, []);

    const stopResizingRef = useRef<() => void>(() => {});

    const stopResizing = useCallback(() => {
        setIsResizing(false);
        isResizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', resize);
        if (stopResizingRef.current) {
            window.removeEventListener('mouseup', stopResizingRef.current);
        }

        setWidth((prevWidth) => computeSnappedWidth(prevWidth));
    }, [resize]);

    useEffect(() => {
        stopResizingRef.current = stopResizing;
    }, [stopResizing]);

    const startResizing = useCallback(() => {
        setIsResizing(true);
        isResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
    }, [resize, stopResizing]);

    // Safety cleanup: remove active drag listeners and restore body styles if unmounted mid-drag
    useEffect(() => {
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [resize, stopResizing]);

    const isCollapsed = width <= COLLAPSED_WIDTH;

    return {
        width,
        isResizing,
        startResizing,
        isCollapsed
    };
}
