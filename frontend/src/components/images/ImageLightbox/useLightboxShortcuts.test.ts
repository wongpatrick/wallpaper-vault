/**
 * @file
 * Module: useLightboxShortcuts Hook Tests
 * Description: Unit tests for ImageLightbox keyboard shortcuts and input focus guards.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLightboxShortcuts } from './useLightboxShortcuts';

describe('useLightboxShortcuts', () => {
    it('handles ArrowLeft and ArrowRight navigation when allowed', () => {
        const onPrev = vi.fn();
        const onNext = vi.fn();
        const onClose = vi.fn();
        const onToggleSidebar = vi.fn();

        renderHook(() =>
            useLightboxShortcuts({
                enabled: true,
                onPrev,
                onNext,
                onClose,
                onToggleSidebar,
                canGoPrev: true,
                canGoNext: true
            })
        );

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(onPrev).toHaveBeenCalledTimes(1);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('does not trigger navigation when canGoPrev/canGoNext are false', () => {
        const onPrev = vi.fn();
        const onNext = vi.fn();

        renderHook(() =>
            useLightboxShortcuts({
                enabled: true,
                onPrev,
                onNext,
                onClose: vi.fn(),
                onToggleSidebar: vi.fn(),
                canGoPrev: false,
                canGoNext: false
            })
        );

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(onPrev).not.toHaveBeenCalled();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(onNext).not.toHaveBeenCalled();
    });

    it('triggers onClose on Escape key', () => {
        const onClose = vi.fn();

        renderHook(() =>
            useLightboxShortcuts({
                enabled: true,
                onPrev: vi.fn(),
                onNext: vi.fn(),
                onClose,
                onToggleSidebar: vi.fn(),
                canGoPrev: true,
                canGoNext: true
            })
        );

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('triggers onToggleSidebar on S key', () => {
        const onToggleSidebar = vi.fn();

        renderHook(() =>
            useLightboxShortcuts({
                enabled: true,
                onPrev: vi.fn(),
                onNext: vi.fn(),
                onClose: vi.fn(),
                onToggleSidebar,
                canGoPrev: true,
                canGoNext: true
            })
        );

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
        expect(onToggleSidebar).toHaveBeenCalledTimes(1);
    });

    it('triggers onEdit and onDelete when actions are enabled', () => {
        const onEdit = vi.fn();
        const onDelete = vi.fn();

        renderHook(() =>
            useLightboxShortcuts({
                enabled: true,
                onPrev: vi.fn(),
                onNext: vi.fn(),
                onClose: vi.fn(),
                onToggleSidebar: vi.fn(),
                onEdit,
                onDelete,
                canGoPrev: true,
                canGoNext: true,
                disableActions: false
            })
        );

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
        expect(onEdit).toHaveBeenCalledTimes(1);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('does not trigger actions when disableActions is true', () => {
        const onEdit = vi.fn();
        const onDelete = vi.fn();

        renderHook(() =>
            useLightboxShortcuts({
                enabled: true,
                onPrev: vi.fn(),
                onNext: vi.fn(),
                onClose: vi.fn(),
                onToggleSidebar: vi.fn(),
                onEdit,
                onDelete,
                canGoPrev: true,
                canGoNext: true,
                disableActions: true
            })
        );

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
        expect(onEdit).not.toHaveBeenCalled();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
        expect(onDelete).not.toHaveBeenCalled();
    });

    it('ignores shortcut events when typing in an input element', () => {
        const onClose = vi.fn();
        const onToggleSidebar = vi.fn();

        renderHook(() =>
            useLightboxShortcuts({
                enabled: true,
                onPrev: vi.fn(),
                onNext: vi.fn(),
                onClose,
                onToggleSidebar,
                canGoPrev: true,
                canGoNext: true
            })
        );

        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();

        const event = new KeyboardEvent('keydown', { key: 's', bubbles: true });
        Object.defineProperty(event, 'target', { value: input, enumerable: true });
        window.dispatchEvent(event);

        expect(onToggleSidebar).not.toHaveBeenCalled();
        document.body.removeChild(input);
    });
});
