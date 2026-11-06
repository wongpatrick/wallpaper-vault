/**
 * @file
 * Unit tests for useImageEditForm hook.
 * Verifies form dirty checking with detailed tags/characters, reset on reopen, and discard confirmation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImageEditForm } from './useImageEditForm';
import { useReadImageApiImagesImageIdGet } from '../../../api/generated/images/images';
import { modals } from '@mantine/modals';
import type { Image as ImageModel, ImageDetail } from '../../../api/model';
import { ImageRating } from '../../../types/enums';

vi.mock('@mantine/modals', () => ({
    modals: {
        openConfirmModal: vi.fn(),
    },
}));

vi.mock('../../../hooks/useAppNotifications', () => ({
    useAppNotifications: () => ({
        showNotification: vi.fn(),
    }),
}));

vi.mock('../../../api/generated/images/images', () => ({
    useUpdateImageApiImagesImageIdPatch: () => ({
        mutateAsync: vi.fn(),
        isPending: false,
    }),
    useReadImageApiImagesImageIdGet: vi.fn(),
}));

describe('useImageEditForm', () => {
    const mockImage: ImageModel = {
        id: 101,
        filename: 'wallpaper_01.png',
        notes: 'Initial image note',
        sort_order: 1,
        aspect_ratio_label: '16:9',
        rating: ImageRating.SAFE,
        dominant_color: '#ffffff',
        created_at: '2026-01-01T00:00:00Z',
        date_added: '2026-01-01T00:00:00Z',
        height: 1080,
        width: 1920,
        aspect_ratio: 1.77,
        is_blacklisted: false,
        is_favorite: false,
        local_path: '/path/to/wallpaper_01.png',
        set_id: 1,
    };

    const mockDetail: ImageDetail = {
        ...mockImage,
        tags: ['scenery', 'night'],
        characters: ['Reimu Hakurei'],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useReadImageApiImagesImageIdGet).mockReturnValue({
            data: mockDetail,
        } as ReturnType<typeof useReadImageApiImagesImageIdGet>);
    });

    it('initializes form and dirty check with detailed tags and characters', () => {
        const { result } = renderHook(() =>
            useImageEditForm({
                image: mockImage,
                opened: true,
                onClose: vi.fn(),
                onUpdated: vi.fn(),
            })
        );

        expect(result.current.form.tags).toEqual(['scenery', 'night']);
        expect(result.current.form.characters).toEqual(['Reimu Hakurei']);
        expect(result.current.isFormDirty).toBe(false);
    });

    it('marks form as dirty when modifying filename or tags', () => {
        const { result } = renderHook(() =>
            useImageEditForm({
                image: mockImage,
                opened: true,
                onClose: vi.fn(),
                onUpdated: vi.fn(),
            })
        );

        act(() => {
            result.current.setField('filename', 'renamed_wallpaper.png');
        });
        expect(result.current.isFormDirty).toBe(true);

        act(() => {
            result.current.setField('filename', 'wallpaper_01.png');
        });
        expect(result.current.isFormDirty).toBe(false);

        act(() => {
            result.current.setField('tags', ['scenery', 'night', 'new_tag']);
        });
        expect(result.current.isFormDirty).toBe(true);
    });

    it('preserves imageDetail tags/characters on resetForm instead of wiping them', () => {
        const { result } = renderHook(() =>
            useImageEditForm({
                image: mockImage,
                opened: true,
                onClose: vi.fn(),
                onUpdated: vi.fn(),
            })
        );

        act(() => {
            result.current.setField('tags', ['completely_different_tag']);
        });
        expect(result.current.form.tags).toEqual(['completely_different_tag']);

        act(() => {
            result.current.resetForm();
        });
        expect(result.current.form.tags).toEqual(['scenery', 'night']);
        expect(result.current.form.characters).toEqual(['Reimu Hakurei']);
        expect(result.current.isFormDirty).toBe(false);
    });

    it('resets form when opened transitions from false to true', () => {
        let opened = true;
        const { result, rerender } = renderHook(() =>
            useImageEditForm({
                image: mockImage,
                opened,
                onClose: vi.fn(),
                onUpdated: vi.fn(),
            })
        );

        act(() => {
            result.current.setField('notes', 'Unsaved note edits');
        });
        expect(result.current.isFormDirty).toBe(true);

        // Modal closed
        opened = false;
        rerender();

        // Modal reopened for same image
        opened = true;
        rerender();

        expect(result.current.form.notes).toBe('Initial image note');
        expect(result.current.isFormDirty).toBe(false);
    });

    it('triggers confirm modal on dirty handleClose and discards changes on confirm', () => {
        const onClose = vi.fn();
        const { result } = renderHook(() =>
            useImageEditForm({
                image: mockImage,
                opened: true,
                onClose,
                onUpdated: vi.fn(),
            })
        );

        act(() => {
            result.current.setField('notes', 'Unsaved note edits');
        });

        act(() => {
            result.current.handleClose();
        });

        expect(modals.openConfirmModal).toHaveBeenCalledTimes(1);
        const modalConfig = vi.mocked(modals.openConfirmModal).mock.calls[0][0];
        expect(modalConfig.title).toBe('Unsaved Changes');

        act(() => {
            modalConfig.onConfirm?.();
        });

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(result.current.form.notes).toBe('Initial image note');
    });
});
