/**
 * @file
 * Unit tests for useImportScanner hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImportScanner } from './useImportScanner';

const mockScanPaths = vi.fn();
const mockValidatePaths = vi.fn();
const mockValidateFiles = vi.fn();
const mockCleanupTemp = vi.fn();
const mockShowNotification = vi.fn();

vi.mock('../../../hooks/useAppNotifications', () => ({
    useAppNotifications: () => ({
        showNotification: mockShowNotification,
    }),
}));

vi.mock('../../../api/generated/images/images', () => ({
    scanImportPathsApiImagesImportScanPathsPost: (...args: unknown[]) => mockScanPaths(...args),
    validateImportPathsApiImagesImportValidatePost: (...args: unknown[]) => mockValidatePaths(...args),
    validateImportUploadedFilesApiImagesImportValidateFilesPost: (...args: unknown[]) => mockValidateFiles(...args),
    cleanupImportTempFilesApiImagesImportCleanupTempPost: (...args: unknown[]) => mockCleanupTemp(...args),
}));

describe('useImportScanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockScanPaths.mockResolvedValue(['/path/1.jpg', '/path/2.jpg']);
        mockValidatePaths.mockResolvedValue({
            items: [
                { local_path: '/path/1.jpg', filename: '1.jpg', is_valid: true, is_duplicate: false },
                { local_path: '/path/2.jpg', filename: '2.jpg', is_valid: true, is_duplicate: false },
            ]
        });
        mockCleanupTemp.mockResolvedValue({ removed_count: 1, message: 'Cleaned' });
    });

    it('cancels in-flight scan when cancelValidation is called without triggering error toast', async () => {
        let resolveScan: (val: string[]) => void;
        mockScanPaths.mockImplementation(() => new Promise((resolve) => {
            resolveScan = resolve;
        }));

        const onValidated = vi.fn();
        const { result } = renderHook(() =>
            useImportScanner({
                opened: true,
                initialLocalPaths: ['/folder'],
                initialFiles: [],
                isElectron: true,
                onValidated,
            })
        );

        expect(result.current.isValidating).toBe(true);

        act(() => {
            result.current.cancelValidation();
        });

        expect(result.current.isValidating).toBe(false);
        expect(mockShowNotification).not.toHaveBeenCalled();

        // Resolving afterwards should not update state
        await act(async () => {
            resolveScan!(['/path/1.jpg']);
        });

        expect(onValidated).not.toHaveBeenCalled();
    });
});
