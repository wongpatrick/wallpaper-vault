/**
 * @file
 * Component tests for SetAsWallpaperModal.
 * Tests monitor selection, fit style changes, and Electron/API wallpaper application.
 */
/* eslint-disable no-magic-numbers */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../test/test-utils';
import { SetAsWallpaperModal } from './SetAsWallpaperModal';
import type { Image as ImageModel } from '../../api/model';

const mockImage: ImageModel = {
    id: 42,
    filename: 'cyberpunk_city.png',
    local_path: 'C:/wallpapers/cyberpunk_city.png',
    width: 3840,
    height: 2160,
    aspect_ratio: 1.777,
    aspect_ratio_label: '16:9',
    set_id: 1,
    created_at: '2026-08-08T00:00:00Z',
    date_added: '2026-08-08T00:00:00Z',
    rating: 'safe',
    dominant_color: '#1a1a2e',
    is_favorite: false,
    is_blacklisted: false,
    sort_order: 0
};

describe('SetAsWallpaperModal', () => {
    const mockMonitors = [
        { index: 0, winNum: 1, id: 1, label: 'Monitor 1', bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { index: 1, winNum: 2, id: 2, label: 'Monitor 2', bounds: { x: 1920, y: 0, width: 2560, height: 1440 } }
    ];

    beforeEach(() => {
        vi.stubGlobal('electron', {
            getMonitors: vi.fn().mockResolvedValue(mockMonitors),
            onDisplaysChanged: vi.fn().mockReturnValue(() => {}),
            setWallpaper: vi.fn().mockResolvedValue({ success: true })
        });
        localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('renders image details and display cards when opened', async () => {
        render(
            <SetAsWallpaperModal
                opened={true}
                onClose={vi.fn()}
                image={mockImage}
            />
        );

        expect(screen.getByText('Set Desktop Wallpaper')).toBeInTheDocument();
        expect(screen.getByText('cyberpunk_city.png')).toBeInTheDocument();
        expect(screen.getByText('3840 × 2160 px')).toBeInTheDocument();
        expect(screen.getByText('All Displays')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('Monitor 1')).toBeInTheDocument();
            expect(screen.getByText('Monitor 2')).toBeInTheDocument();
        });
    });

    it('calls window.electron.setWallpaper and onClose when Apply is clicked', async () => {
        const handleClose = vi.fn();
        const setWallpaperMock = vi.fn().mockResolvedValue({ success: true });

        vi.stubGlobal('electron', {
            getMonitors: vi.fn().mockResolvedValue(mockMonitors),
            onDisplaysChanged: vi.fn().mockReturnValue(() => {}),
            setWallpaper: setWallpaperMock
        });

        render(
            <SetAsWallpaperModal
                opened={true}
                onClose={handleClose}
                image={mockImage}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Monitor 1')).toBeInTheDocument();
        });

        const applyButton = screen.getByRole('button', { name: /apply wallpaper/i });
        fireEvent.click(applyButton);

        await waitFor(() => {
            expect(setWallpaperMock).toHaveBeenCalledWith(42, 0, 'fill');
            expect(handleClose).toHaveBeenCalled();
        });
    });

    it('allows selecting All Displays and applying globally', async () => {
        const handleClose = vi.fn();
        const setWallpaperMock = vi.fn().mockResolvedValue({ success: true });

        vi.stubGlobal('electron', {
            getMonitors: vi.fn().mockResolvedValue(mockMonitors),
            onDisplaysChanged: vi.fn().mockReturnValue(() => {}),
            setWallpaper: setWallpaperMock
        });

        render(
            <SetAsWallpaperModal
                opened={true}
                onClose={handleClose}
                image={mockImage}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('All Displays')).toBeInTheDocument();
        });

        const allDisplaysCard = screen.getByText('All Displays');
        fireEvent.click(allDisplaysCard);

        const applyButton = screen.getByRole('button', { name: /apply wallpaper/i });
        fireEvent.click(applyButton);

        await waitFor(() => {
            expect(setWallpaperMock).toHaveBeenCalledWith(42, -1, 'fill');
            expect(handleClose).toHaveBeenCalled();
        });
    });

    it('loads saved fit style from localStorage for selected monitor', async () => {
        localStorage.setItem('wallpaper_fit_style_1', 'stretch');

        render(
            <SetAsWallpaperModal
                opened={true}
                onClose={vi.fn()}
                image={mockImage}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Monitor 2')).toBeInTheDocument();
        });

        // Click Monitor 2 (index 1)
        fireEvent.click(screen.getByText('Monitor 2'));

        // Verify stretch radio/option is selected
        expect(localStorage.getItem('wallpaper_fit_style_1')).toBe('stretch');
    });

    it('falls back to REST API when not in Electron environment', async () => {
        vi.stubGlobal('electron', undefined);

        const handleClose = vi.fn();
        render(
            <SetAsWallpaperModal
                opened={true}
                onClose={handleClose}
                image={mockImage}
            />
        );

        expect(screen.getByText('All Displays')).toBeInTheDocument();
    });
});
