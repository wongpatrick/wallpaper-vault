/**
 * @file
 * Unit tests for CreatorEditModal verifying unsaved state reversion and confirm modal lifecycle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../test/test-utils';
import { CreatorEditModal } from './CreatorEditModal';
import { modals } from '@mantine/modals';

vi.mock('@mantine/modals', () => ({
    modals: {
        openConfirmModal: vi.fn(),
    },
}));

describe('CreatorEditModal', () => {
    const initialData = {
        canonical_name: 'Original Artist',
        type: 'Artist',
        notes: 'Initial notes',
        socials: [{ platform: 'Twitter' as const, url: 'https://twitter.com/original' }],
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders form with initial data when opened', () => {
        render(
            <CreatorEditModal
                opened={true}
                onClose={vi.fn()}
                initialData={initialData}
                onSave={vi.fn()}
            />
        );

        expect(screen.getByLabelText('Artist Name')).toHaveValue('Original Artist');
        expect(screen.getByLabelText('Internal Notes')).toHaveValue('Initial notes');
    });

    it('prompts confirm dialog on dirty close and resets form upon discard', () => {
        const onClose = vi.fn();
        const { rerender, container } = render(
            <CreatorEditModal
                opened={true}
                onClose={onClose}
                initialData={initialData}
                onSave={vi.fn()}
            />
        );

        const nameInput = screen.getByLabelText('Artist Name');
        fireEvent.change(nameInput, { target: { value: 'Modified Artist Name' } });
        expect(nameInput).toHaveValue('Modified Artist Name');

        // Close via modal close button
        const closeBtn = container.ownerDocument.querySelector('.mantine-Modal-close') as HTMLElement;
        expect(closeBtn).toBeTruthy();
        fireEvent.click(closeBtn);

        expect(modals.openConfirmModal).toHaveBeenCalledTimes(1);
        const confirmArgs = vi.mocked(modals.openConfirmModal).mock.calls[0][0];
        expect(confirmArgs.title).toBe('Unsaved Changes');

        // Execute discard
        confirmArgs.onConfirm?.();
        expect(onClose).toHaveBeenCalled();

        // Reopen modal to ensure state was reset
        rerender(
            <CreatorEditModal
                opened={false}
                onClose={onClose}
                initialData={initialData}
                onSave={vi.fn()}
            />
        );
        rerender(
            <CreatorEditModal
                opened={true}
                onClose={onClose}
                initialData={initialData}
                onSave={vi.fn()}
            />
        );

        expect(screen.getByLabelText('Artist Name')).toHaveValue('Original Artist');
    });

    it('closes immediately without confirm modal if form is pristine', () => {
        const onClose = vi.fn();
        const { container } = render(
            <CreatorEditModal
                opened={true}
                onClose={onClose}
                initialData={initialData}
                onSave={vi.fn()}
            />
        );

        const closeBtn = container.ownerDocument.querySelector('.mantine-Modal-close') as HTMLElement;
        expect(closeBtn).toBeTruthy();
        fireEvent.click(closeBtn);

        expect(modals.openConfirmModal).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });
});
