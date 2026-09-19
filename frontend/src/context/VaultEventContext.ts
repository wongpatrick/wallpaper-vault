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

export const VaultEventContext = createContext<VaultEventContextType | undefined>(undefined);

export function useVaultEvent(): VaultEventContextType {
    const context = useContext(VaultEventContext);
    if (!context) {
        return {
            onVaultSwitch: () => () => {}
        };
    }
    return context;
}
