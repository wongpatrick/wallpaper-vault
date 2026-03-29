import { useState, useCallback, useEffect, useRef } from 'react';

const MIN_WIDTH = 80;
const MAX_WIDTH = 400;
const COLLAPSED_WIDTH = 80;
const EXPANDED_DEFAULT_WIDTH = 280;
const SNAP_THRESHOLD = 150;

export function useSidebarResizer() {
    const [width, setWidth] = useState(EXPANDED_DEFAULT_WIDTH);
    const [isResizing, setIsResizing] = useState(false);
    const isResizingRef = useRef(false);

    const startResizing = useCallback(() => {
        setIsResizing(true);
        isResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
        isResizingRef.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';

        // Snapping logic
        setWidth((prevWidth) => {
            if (prevWidth < SNAP_THRESHOLD) {
                return COLLAPSED_WIDTH;
            } else if (prevWidth < EXPANDED_DEFAULT_WIDTH + 50) {
                return EXPANDED_DEFAULT_WIDTH;
            }
            return prevWidth;
        });
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizingRef.current) {
            const newWidth = e.clientX;
            if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
                setWidth(newWidth);
            }
        }
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
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
