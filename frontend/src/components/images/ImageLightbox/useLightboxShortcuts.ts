/**
 * @file
 * Module: useLightboxShortcuts Hook
 * Description: Keyboard shortcut listener for ImageLightbox navigation, toggles, and action triggers.
 */
import { useEffect } from 'react';

export interface UseLightboxShortcutsOptions {
    enabled: boolean;
    onPrev: () => void;
    onNext: () => void;
    onClose: () => void;
    onToggleSidebar: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onToggleFavorite?: () => void;
    canGoPrev: boolean;
    canGoNext: boolean;
    disableActions?: boolean;
}

export function useLightboxShortcuts({
    enabled,
    onPrev,
    onNext,
    onClose,
    onToggleSidebar,
    onEdit,
    onDelete,
    onToggleFavorite,
    canGoPrev,
    canGoNext,
    disableActions = false
}: UseLightboxShortcutsOptions) {
    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            // Guard: Ignore shortcuts if typing in input, textarea, or contentEditable
            const target = event.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable)
            ) {
                return;
            }

            switch (event.key) {
                case 'ArrowLeft':
                    if (canGoPrev) {
                        event.preventDefault();
                        onPrev();
                    }
                    break;
                case 'ArrowRight':
                    if (canGoNext) {
                        event.preventDefault();
                        onNext();
                    }
                    break;
                case 'Escape':
                    event.preventDefault();
                    onClose();
                    break;
                case 's':
                case 'S':
                    event.preventDefault();
                    onToggleSidebar();
                    break;
                case 'e':
                case 'E':
                    if (!disableActions && onEdit) {
                        event.preventDefault();
                        onEdit();
                    }
                    break;
                case 'd':
                case 'D':
                    if (!disableActions && onDelete) {
                        event.preventDefault();
                        onDelete();
                    }
                    break;
                case 'f':
                case 'F':
                    if (!disableActions && onToggleFavorite) {
                        event.preventDefault();
                        onToggleFavorite();
                    }
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [
        enabled,
        onPrev,
        onNext,
        onClose,
        onToggleSidebar,
        onEdit,
        onDelete,
        onToggleFavorite,
        canGoPrev,
        canGoNext,
        disableActions
    ]);
}
