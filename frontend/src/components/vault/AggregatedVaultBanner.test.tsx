/**
 * @file
 * Unit tests for AggregatedVaultBanner component.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { AggregatedVaultBanner } from './AggregatedVaultBanner';
import type { VaultEntry } from '../../types/vault';

const mockOfflineVaults: VaultEntry[] = [
    {
        id: 'remote-1',
        label: 'Remote Server',
        url: 'http://192.168.1.50:8000',
        status: 'offline',
        isLocal: false,
    },
    {
        id: 'remote-2',
        label: 'Backup NAS',
        url: 'http://192.168.1.60:8000',
        status: 'offline',
        isLocal: false,
    }
];

describe('AggregatedVaultBanner', () => {
    it('renders nothing when not in aggregated mode', () => {
        render(
            <MemoryRouter>
                <AggregatedVaultBanner
                    isAggregated={false}
                    onlineCount={1}
                    totalVaultsCount={3}
                    offlineVaults={mockOfflineVaults}
                />
            </MemoryRouter>
        );

        expect(screen.queryByTestId('aggregated-vault-banner')).not.toBeInTheDocument();
    });

    it('renders nothing when all vaults are online in aggregated mode', () => {
        render(
            <MemoryRouter>
                <AggregatedVaultBanner
                    isAggregated={true}
                    onlineCount={3}
                    totalVaultsCount={3}
                    offlineVaults={[]}
                />
            </MemoryRouter>
        );

        expect(screen.queryByTestId('aggregated-vault-banner')).not.toBeInTheDocument();
    });


    it('renders alert and badges when offline vaults exist in aggregated mode', () => {
        render(
            <MemoryRouter>
                <AggregatedVaultBanner
                    isAggregated={true}
                    onlineCount={1}
                    totalVaultsCount={3}
                    offlineVaults={mockOfflineVaults}
                />
            </MemoryRouter>
        );
        expect(screen.getByText(/Aggregated View: 1 of 3 Vaults Online/i)).toBeInTheDocument();
        expect(screen.getAllByText(/Remote Server/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Backup NAS/).length).toBeGreaterThan(0);
        expect(screen.getByText(/Manage Vaults/i)).toBeInTheDocument();
    });
});



