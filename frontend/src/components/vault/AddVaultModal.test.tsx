/**
 * @file
 * Unit tests for AddVaultModal component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../test/test-utils';
import { VaultProvider } from '../../context/VaultProvider';
import { AddVaultModal } from './AddVaultModal';

describe('AddVaultModal Component', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('renders modal inputs and buttons when opened', () => {
        render(
            <VaultProvider>
                <AddVaultModal opened={true} onClose={vi.fn()} />
            </VaultProvider>
        );

        expect(screen.getByText('Connect Remote Vault')).toBeInTheDocument();
        expect(screen.getByLabelText(/Server URL/i)).toBeInTheDocument();
        expect(screen.getByText('Test Connection')).toBeInTheDocument();
    });

    it('tests connection and displays success alert', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 200,
            json: async () => ({ vault_id: 'v123', vault_name: 'Living Room NAS', version: '0.1.0' })
        } as unknown as Response);

        render(
            <VaultProvider>
                <AddVaultModal opened={true} onClose={vi.fn()} />
            </VaultProvider>
        );

        const urlInput = screen.getByLabelText(/Server URL/i);
        fireEvent.change(urlInput, { target: { value: 'http://192.168.1.50:8000' } });

        const testBtn = screen.getByText('Test Connection');
        fireEvent.click(testBtn);

        await waitFor(() => {
            expect(screen.getByText('Connection Successful')).toBeInTheDocument();
        });
        expect(screen.getByText(/Connected to/i)).toBeInTheDocument();
    });
});
