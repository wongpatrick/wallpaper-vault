/**
 * @file
 * React context definitions for multi-vault management and switchable active backend context.
 * Split into VaultStateContext (reactive data) and VaultActionsContext (stable functions)
 * to eliminate unnecessary re-renders in action-only consumers.
 */
import { createContext } from 'react';
import type { VaultEntry, TestConnectionResult } from '../types/electron';

export interface VaultStateContextType {
    vaults: VaultEntry[];
    onlineVaults: VaultEntry[];
    activeVault: VaultEntry;
    isAggregated: boolean;
    isLoading: boolean;
}

export interface VaultActionsContextType {
    switchVault: (vaultId: string) => Promise<void>;
    addVault: (payload: { label: string; url: string; apiKey?: string }) => Promise<VaultEntry>;
    updateVault: (id: string, updates: Partial<{ label: string; url: string; apiKey: string }>) => Promise<VaultEntry>;
    removeVault: (id: string) => Promise<void>;
    testConnection: (url: string, apiKey?: string) => Promise<TestConnectionResult>;
    refreshHealth: () => Promise<void>;
    setAggregated: (aggregated: boolean) => void;
}

export type VaultContextType = VaultStateContextType & VaultActionsContextType;

export const VaultStateContext = createContext<VaultStateContextType | undefined>(undefined);
export const VaultActionsContext = createContext<VaultActionsContextType | undefined>(undefined);
export const VaultContext = createContext<VaultContextType | undefined>(undefined);
