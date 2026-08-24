/**
 * @file
 * Unit tests for ConnectedVaultsSection component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../../test/test-utils';
import { VaultProvider } from '../../../context/VaultProvider';
import { ConnectedVaultsSection } from './ConnectedVaultsSection';

describe('ConnectedVaultsSection Component', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('renders connected vaults table with local vault', () => {
        render(
            <VaultProvider>
                <ConnectedVaultsSection />
            </VaultProvider>
        );

        expect(screen.getByText('Connected Vaults')).toBeInTheDocument();
        expect(screen.getByText('Local Built-in')).toBeInTheDocument();
        expect(screen.getByText('Active Context')).toBeInTheDocument();
    });
});
