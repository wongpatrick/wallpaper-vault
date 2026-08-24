/**
 * @file
 * Tests for VaultProvider and useVault hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '../test/test-utils';
import { VaultProvider } from './VaultProvider';
import { useVault } from '../hooks/useVault';
import { AXIOS_INSTANCE } from '../api/axios-instance';

function TestConsumer() {
    const { vaults, activeVault, switchVault, addVault, removeVault, isAggregated, setAggregated, onlineVaults } = useVault();
    return (
        <div>
            <div data-testid="active-vault">{activeVault.label}</div>
            <div data-testid="active-url">{activeVault.url}</div>
            <div data-testid="vault-count">{vaults.length}</div>
            <div data-testid="is-aggregated">{isAggregated ? 'true' : 'false'}</div>
            <div data-testid="online-count">{onlineVaults.length}</div>
            <button
                data-testid="add-btn"
                onClick={() => addVault({ label: 'NAS Vault', url: 'http://192.168.1.100:8000', apiKey: 'testkey' })}
            >
                Add Remote
            </button>
            <button
                data-testid="switch-btn"
                onClick={() => vaults[1] && switchVault(vaults[1].id)}
            >
                Switch to Second
            </button>
            <button
                data-testid="switch-all-btn"
                onClick={() => switchVault('all')}
            >
                Switch to All
            </button>
            <button
                data-testid="toggle-agg-btn"
                onClick={() => setAggregated(!isAggregated)}
            >
                Toggle Aggregated
            </button>
            <button
                data-testid="remove-btn"
                onClick={() => vaults[1] && removeVault(vaults[1].id)}
            >
                Remove Second
            </button>
        </div>
    );
}

describe('VaultProvider & useVault', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('initializes with default local vault in web mode', () => {
        render(
            <VaultProvider>
                <TestConsumer />
            </VaultProvider>
        );

        expect(screen.getByTestId('active-vault').textContent).toBe('Local');
        expect(screen.getByTestId('vault-count').textContent).toBe('1');
        expect(screen.getByTestId('is-aggregated').textContent).toBe('false');
        expect(screen.getByTestId('online-count').textContent).toBe('1');
    });

    it('allows adding and switching between vaults', async () => {
        // Mock global fetch for testConnection
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 200,
            json: async () => ({ vault_id: 'remote-1', vault_name: 'NAS Server', version: '0.1.0' })
        } as unknown as Response);

        render(
            <VaultProvider>
                <TestConsumer />
            </VaultProvider>
        );

        await act(async () => {
            screen.getByTestId('add-btn').click();
        });

        expect(screen.getByTestId('vault-count').textContent).toBe('2');

        await act(async () => {
            screen.getByTestId('switch-btn').click();
        });

        expect(screen.getByTestId('active-vault').textContent).toBe('NAS Vault');
        expect(screen.getByTestId('active-url').textContent).toBe('http://192.168.1.100:8000');
        expect(AXIOS_INSTANCE.defaults.baseURL).toBe('http://192.168.1.100:8000');
        expect(localStorage.getItem('api_key')).toBe('testkey');
    });

    it('handles aggregated mode switching', async () => {
        render(
            <VaultProvider>
                <TestConsumer />
            </VaultProvider>
        );

        expect(screen.getByTestId('is-aggregated').textContent).toBe('false');

        await act(async () => {
            screen.getByTestId('switch-all-btn').click();
        });

        expect(screen.getByTestId('is-aggregated').textContent).toBe('true');
        expect(localStorage.getItem('vault_aggregated_mode')).toBe('true');

        await act(async () => {
            screen.getByTestId('toggle-agg-btn').click();
        });

        expect(screen.getByTestId('is-aggregated').textContent).toBe('false');
        expect(localStorage.getItem('vault_aggregated_mode')).toBe('false');
    });

    it('removes a remote vault and reverts active vault if needed', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 200,
            json: async () => ({ vault_id: 'remote-1', vault_name: 'NAS Server', version: '0.1.0' })
        } as unknown as Response);

        render(
            <VaultProvider>
                <TestConsumer />
            </VaultProvider>
        );

        await act(async () => {
            screen.getByTestId('add-btn').click();
        });
        expect(screen.getByTestId('vault-count').textContent).toBe('2');

        await act(async () => {
            screen.getByTestId('remove-btn').click();
        });
        expect(screen.getByTestId('vault-count').textContent).toBe('1');
        expect(screen.getByTestId('active-vault').textContent).toBe('Local');
    });
});

