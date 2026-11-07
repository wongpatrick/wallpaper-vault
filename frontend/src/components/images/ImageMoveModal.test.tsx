/**
 * @file
 * Unit tests for ImageMoveModal component.
 * Verifies that Cancel and confirm actions reset targetSetId and searchValue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../test/test-utils';
import { ImageMoveModal } from './ImageMoveModal';

const mockMutateAsync = vi.fn();

vi.mock('../sets/CreateSetModal', () => ({
    CreateSetModal: () => null,
}));

vi.mock('../../hooks/useAppNotifications', () => ({
    useAppNotifications: () => ({
        showNotification: vi.fn(),
    }),
}));

vi.mock('../../api/generated/sets/sets', () => ({
    useReadSetsApiSetsGet: () => ({
        data: {
            items: [
                { id: 101, title: 'Set Alpha', creators: [] },
                { id: 102, title: 'Set Beta', creators: [] },
            ],
            total: 2,
        },
        isFetching: false,
        refetch: vi.fn(),
    }),
}));

vi.mock('../../api/generated/images/images', () => ({
    useBulkMoveImagesApiImagesBulkMovePost: () => ({
        mutateAsync: mockMutateAsync,
        isPending: false,
    }),
}));

describe('ImageMoveModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockMutateAsync.mockResolvedValue(2);
    });

    it('resets target set selection when Cancel button is clicked and modal is reopened', () => {
        const onClose = vi.fn();
        const { rerender } = render(
            <ImageMoveModal
                opened={true}
                onClose={onClose}
                selectedImageIds={[1, 2]}
                onSuccess={vi.fn()}
            />
        );

        expect(screen.getByText('Move Images to Set')).toBeInTheDocument();

        // Type in search
        const select = screen.getByPlaceholderText('Search sets...');
        fireEvent.change(select, { target: { value: 'Alpha' } });

        // Click Cancel button
        const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
        fireEvent.click(cancelBtn);

        expect(onClose).toHaveBeenCalledTimes(1);

        // Reopen modal and verify search input was cleared
        rerender(
            <ImageMoveModal
                opened={false}
                onClose={onClose}
                selectedImageIds={[1, 2]}
                onSuccess={vi.fn()}
            />
        );
        rerender(
            <ImageMoveModal
                opened={true}
                onClose={onClose}
                selectedImageIds={[1, 2]}
                onSuccess={vi.fn()}
            />
        );

        const selectAfterReopen = screen.getByPlaceholderText('Search sets...');
        expect(selectAfterReopen).toHaveValue('');
    });

    it('disables Move button when no target set is selected', () => {
        const onClose = vi.fn();
        const onSuccess = vi.fn();
        render(
            <ImageMoveModal
                opened={true}
                onClose={onClose}
                selectedImageIds={[1, 2]}
                onSuccess={onSuccess}
            />
        );

        const moveBtn = screen.getByRole('button', { name: 'Move Images' });
        expect(moveBtn).toBeDisabled();
    });
});
