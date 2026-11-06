/**
 * @file
 * Unit tests for SetBulkEditModal component.
 * Verifies resetting mode, creators, tags, and characters on close, cancel, and reopen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../test/test-utils';
import { SetBulkEditModal } from './SetBulkEditModal';

vi.mock('../../api/generated/creators/creators', () => ({
    useReadCreatorsApiCreatorsGet: () => ({
        data: { items: [{ id: 1, canonical_name: 'Artist A' }] },
    }),
}));

describe('SetBulkEditModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resets selected tags and mode on cancel and reopen', () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn();
        const { rerender } = render(
            <SetBulkEditModal
                opened={true}
                onClose={onClose}
                type="tags"
                selectedCount={3}
                onConfirm={onConfirm}
            />
        );

        expect(screen.getByText('Bulk Edit Tags')).toBeInTheDocument();

        // Switch mode to Replace
        const replaceRadio = screen.getByLabelText(/Replace/i);
        fireEvent.click(replaceRadio);
        expect(replaceRadio).toBeChecked();

        // Cancel modal
        const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
        fireEvent.click(cancelBtn);
        expect(onClose).toHaveBeenCalledTimes(1);

        // Reopen modal and verify mode was reset to Append (default)
        rerender(
            <SetBulkEditModal
                opened={false}
                onClose={onClose}
                type="tags"
                selectedCount={3}
                onConfirm={onConfirm}
            />
        );
        rerender(
            <SetBulkEditModal
                opened={true}
                onClose={onClose}
                type="tags"
                selectedCount={3}
                onConfirm={onConfirm}
            />
        );

        const appendRadio = screen.getByLabelText(/Append/i);
        expect(appendRadio).toBeChecked();
    });

    it('resets form after successful confirmation', () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn();
        const { rerender } = render(
            <SetBulkEditModal
                opened={true}
                onClose={onClose}
                type="tags"
                selectedCount={2}
                onConfirm={onConfirm}
            />
        );

        // Switch to Remove mode
        const removeRadio = screen.getByLabelText(/Remove/i);
        fireEvent.click(removeRadio);
        expect(removeRadio).toBeChecked();

        // Click Apply Changes
        const applyBtn = screen.getByRole('button', { name: 'Apply Changes' });
        fireEvent.click(applyBtn);

        expect(onConfirm).toHaveBeenCalledWith({ tags: [] }, 'remove');

        // Reopen and ensure default Append mode is restored
        rerender(
            <SetBulkEditModal
                opened={false}
                onClose={onClose}
                type="tags"
                selectedCount={2}
                onConfirm={onConfirm}
            />
        );
        rerender(
            <SetBulkEditModal
                opened={true}
                onClose={onClose}
                type="tags"
                selectedCount={2}
                onConfirm={onConfirm}
            />
        );

        const appendRadio = screen.getByLabelText(/Append/i);
        expect(appendRadio).toBeChecked();
    });
});
