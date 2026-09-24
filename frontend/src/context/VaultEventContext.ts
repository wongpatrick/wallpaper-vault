/**
 * @file
 * React context for vault-switch event subscriptions.
 * Provides a clean React-native alternative to CustomEvent('vault-switched').
 */
import { createContext, useContext } from 'react';
import type { VaultEntry } from '../types/electron';

export interface VaultEventContextType {
    onVaultSwitch: (callback: (vault: VaultEntry) => void) => () => void;
}

const NOOP_VAULT_EVENT: VaultEventContextType = {
    onVaultSwitch: () => () => {}
};

export const VaultEventContext = createContext<VaultEventContextType | undefined>(undefined);

export function useVaultEvent(): VaultEventContextType {
    const context = useContext(VaultEventContext);
    if (!context) {
        return NOOP_VAULT_EVENT;
    }
    return context;
}
