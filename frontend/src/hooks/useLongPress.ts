/**
 * @file useLongPress.ts
 * React hook managing long-press gestures on mouse and touch devices.
 */
import { useCallback, useRef, useEffect, useMemo } from 'react';

const DEFAULT_LONG_PRESS_DELAY = 500;

export interface LongPressOptions {
    shouldPreventDefault?: boolean;
    delay?: number;
}

export interface UseLongPressConfig extends LongPressOptions {
    onLongPress: (e: React.MouseEvent | React.TouchEvent) => void;
    onClick?: (e: React.MouseEvent | React.TouchEvent) => void;
}

export type LongPressHandler = (e: React.MouseEvent | React.TouchEvent) => void;

export function useLongPress(
    onLongPressOrConfig: LongPressHandler | UseLongPressConfig,
    onClickHandler?: LongPressHandler,
    options?: LongPressOptions
) {
    const isConfigObject = typeof onLongPressOrConfig === 'object' && onLongPressOrConfig !== null;
    const onLongPress = isConfigObject ? onLongPressOrConfig.onLongPress : onLongPressOrConfig;
    const onClick = isConfigObject ? onLongPressOrConfig.onClick : onClickHandler;
    const resolvedOptions = isConfigObject ? onLongPressOrConfig : options;

    const delay = resolvedOptions?.delay ?? DEFAULT_LONG_PRESS_DELAY;
    const shouldPreventDefault = resolvedOptions?.shouldPreventDefault ?? true;

    const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const longPressTriggered = useRef(false);

    // Keep handler refs updated inside effect to comply with React 19 ref guidelines
    const onLongPressRef = useRef(onLongPress);
    const onClickRef = useRef(onClick);

    useEffect(() => {
        onLongPressRef.current = onLongPress;
        onClickRef.current = onClick;
    }, [onLongPress, onClick]);

    useEffect(() => {
        return () => {
            if (timeout.current) {
                clearTimeout(timeout.current);
            }
        };
    }, []);

    const clear = useCallback((event: React.MouseEvent | React.TouchEvent, shouldTriggerClick = true) => {
        if (timeout.current) {
            clearTimeout(timeout.current);
            timeout.current = undefined;
        }
        if (shouldTriggerClick && !longPressTriggered.current) {
            onClickRef.current?.(event);
        }
        longPressTriggered.current = false;
    }, []);

    const start = useCallback((event: React.MouseEvent | React.TouchEvent) => {
        longPressTriggered.current = false;
        if (timeout.current) {
            clearTimeout(timeout.current);
        }
        timeout.current = setTimeout(() => {
            longPressTriggered.current = true;
            onLongPressRef.current(event);
        }, delay);
    }, [delay]);

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        clear(e, true);
    }, [clear]);

    const handleMouseLeave = useCallback((e: React.MouseEvent) => {
        clear(e, false);
    }, [clear]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (shouldPreventDefault && longPressTriggered.current && e.cancelable) {
            e.preventDefault();
        }
        clear(e, true);
    }, [shouldPreventDefault, clear]);

    return useMemo(() => ({
        onMouseDown: start,
        onTouchStart: start,
        onMouseUp: handleMouseUp,
        onMouseLeave: handleMouseLeave,
        onTouchEnd: handleTouchEnd
    }), [start, handleMouseUp, handleMouseLeave, handleTouchEnd]);
}
