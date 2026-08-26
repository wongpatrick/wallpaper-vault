/**
 * @file
 * React context definitions for multi-vault management and switchable active backend context.
 */
import { createContext } from 'react';
import type { VaultEntry, TestConnectionResult } from '../types/electron';

export interface VaultContextType {
    vaults: VaultEntry[];
    onlineVaults: VaultEntry[];
    activeVault: VaultEntry;
    isAggregated: boolean;
    setAggregated: (aggregated: boolean) => void;
    isLoading: boolean;
    switchVault: (vaultId: string) => Promise<void>;
    addVault: (payload: { label: string; url: string; apiKey?: string }) => Promise<VaultEntry>;
    updateVault: (id: string, updates: Partial<{ label: string; url: string; apiKey: string }>) => Promise<VaultEntry>;
    removeVault: (id: string) => Promise<void>;
    testConnection: (url: string, apiKey?: string) => Promise<TestConnectionResult>;
    refreshHealth: () => Promise<void>;
}

export const VaultContext = createContext<VaultContextType | undefined>(undefined);

