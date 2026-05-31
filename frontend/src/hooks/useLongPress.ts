/** @file useLongPress.ts */
import { useCallback, useRef } from 'react';

const DEFAULT_LONG_PRESS_DELAY = 500;

export function useLongPress(
    onLongPress: (e: React.MouseEvent | React.TouchEvent) => void,
    onClick: (e: React.MouseEvent | React.TouchEvent) => void,
    { shouldPreventDefault = true, delay = DEFAULT_LONG_PRESS_DELAY } = {}
) {
    const timeout = useRef<NodeJS.Timeout>();
    const target = useRef<EventTarget>();
    const longPressTriggered = useRef(false);

    const start = useCallback(
        (event: React.MouseEvent | React.TouchEvent) => {
            longPressTriggered.current = false;
            if (shouldPreventDefault && event.target) {
                event.target.addEventListener('touchend', preventDefault, { passive: false });
                target.current = event.target;
            }
            timeout.current = setTimeout(() => {
                longPressTriggered.current = true;
                onLongPress(event);
            }, delay);
        },
        [onLongPress, delay, shouldPreventDefault]
    );

    const clear = useCallback(
        (event: React.MouseEvent | React.TouchEvent, shouldTriggerClick = true) => {
            if (timeout.current) {
                clearTimeout(timeout.current);
            }
            if (shouldTriggerClick && !longPressTriggered.current) {
                onClick(event);
            }
            longPressTriggered.current = false;
            if (shouldPreventDefault && target.current) {
                target.current.removeEventListener('touchend', preventDefault);
            }
        },
        [shouldPreventDefault, onClick]
    );

    return {
        onMouseDown: (e: React.MouseEvent) => start(e),
        onTouchStart: (e: React.TouchEvent) => start(e),
        onMouseUp: (e: React.MouseEvent) => clear(e),
        onMouseLeave: (e: React.MouseEvent) => clear(e, false),
        onTouchEnd: (e: React.TouchEvent) => clear(e)
    };
}

const preventDefault = (event: Event) => {
    if (!('touches' in event)) return;
    if ((event as TouchEvent).touches.length < 2 && event.preventDefault) {
        event.preventDefault();
    }
};
