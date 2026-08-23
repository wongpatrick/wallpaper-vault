/**
 * @file
 * Unit tests for VaultSwitcher component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../test/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { VaultProvider } from '../../context/VaultProvider';
import { VaultSwitcher } from './VaultSwitcher';

describe('VaultSwitcher Component', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('renders the active vault pill and shows label', () => {
        render(
            <MemoryRouter>
                <VaultProvider>
                    <VaultSwitcher />
                </VaultProvider>
            </MemoryRouter>
        );

        expect(screen.getByText('Local')).toBeInTheDocument();
    });

    it('opens dropdown menu on click', async () => {
        render(
            <MemoryRouter>
                <VaultProvider>
                    <VaultSwitcher />
                </VaultProvider>
            </MemoryRouter>
        );

        const pill = screen.getByText('Local');
        fireEvent.click(pill);

        await waitFor(() => {
            expect(screen.getByText('Connected Vaults')).toBeInTheDocument();
        });
        expect(screen.getByText('Connect Remote Vault...')).toBeInTheDocument();
        expect(screen.getByText('Manage Vaults')).toBeInTheDocument();
    });
});
