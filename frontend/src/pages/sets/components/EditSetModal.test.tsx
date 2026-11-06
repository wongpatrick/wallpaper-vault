/**
 * @file
 * Unit tests for EditSetModal component.
 * Verifies dirty checking, unsaved changes confirmation dialog, and form reset on close/reopen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../../test/test-utils';
import { EditSetModal } from './EditSetModal';
import { modals } from '@mantine/modals';
import type { Set as SetModel } from '../../../api/model';

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

vi.mock('../../../api/generated/creators/creators', () => ({
    useReadCreatorsApiCreatorsGet: () => ({
        data: { items: [{ id: 1, canonical_name: 'Artist A' }] },
    }),
    useCreateCreatorApiCreatorsPost: () => ({
        mutateAsync: vi.fn(),
    }),
}));

vi.mock('../../../api/generated/sets/sets', () => ({
    useUpdateSetApiSetsSetIdPatch: () => ({
        mutateAsync: vi.fn(),
        isPending: false,
    }),
    getReadSetsApiSetsGetQueryKey: () => ['sets'],
}));

describe('EditSetModal', () => {
    const mockSet: SetModel = {
        id: 10,
        title: 'Original Set Title',
        notes: 'Original Notes',
        source_url: 'https://example.com/set',
        local_path: 'C:/sets/set10',
        creators: [{ id: 1, canonical_name: 'Artist A' }],
        tags: ['nature', 'forest'],
        characters: ['Marisa Kirisame'],
        created_at: '2026-01-01T00:00:00Z',
        date_added: '2026-01-01T00:00:00Z',
        images: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders with initial set values when opened', () => {
        render(
            <EditSetModal
                opened={true}
                onClose={vi.fn()}
                set={mockSet}
                onSuccess={vi.fn()}
            />
        );

        expect(screen.getByLabelText(/Set Title/i)).toHaveValue('Original Set Title');
        expect(screen.getByPlaceholderText(/Additional notes about this set.../i)).toHaveValue('Original Notes');
    });

    it('prompts confirm dialog when Cancel is clicked on dirty form', () => {
        const onClose = vi.fn();
        const { rerender } = render(
            <EditSetModal
                opened={true}
                onClose={onClose}
                set={mockSet}
                onSuccess={vi.fn()}
            />
        );

        const titleInput = screen.getByLabelText(/Set Title/i);
        fireEvent.change(titleInput, { target: { value: 'Modified Set Title' } });
        expect(titleInput).toHaveValue('Modified Set Title');

        const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
        fireEvent.click(cancelBtn);

        expect(modals.openConfirmModal).toHaveBeenCalledTimes(1);
        const confirmCall = vi.mocked(modals.openConfirmModal).mock.calls[0][0];
        expect(confirmCall.title).toBe('Unsaved Changes');

        // Confirm discard
        confirmCall.onConfirm?.();
        expect(onClose).toHaveBeenCalled();

        // Reopen to verify title reverted to initial
        rerender(
            <EditSetModal
                opened={false}
                onClose={onClose}
                set={mockSet}
                onSuccess={vi.fn()}
            />
        );
        rerender(
            <EditSetModal
                opened={true}
                onClose={onClose}
                set={mockSet}
                onSuccess={vi.fn()}
            />
        );

        expect(screen.getByLabelText(/Set Title/i)).toHaveValue('Original Set Title');
    });

    it('closes cleanly without confirmation when form is not dirty', () => {
        const onClose = vi.fn();
        render(
            <EditSetModal
                opened={true}
                onClose={onClose}
                set={mockSet}
                onSuccess={vi.fn()}
            />
        );

        const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
        fireEvent.click(cancelBtn);

        expect(modals.openConfirmModal).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });
});
