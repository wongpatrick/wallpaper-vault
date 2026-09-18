/**
 * @file
 * Hooks for consuming Vault contexts.
 * Provides fine-grained useVaultState and useVaultActions hooks to optimize rendering,
 * while maintaining the unified useVault hook for full backward compatibility.
 */
import { useContext } from 'react';
import {
    VaultContext,
    VaultStateContext,
    VaultActionsContext,
    type VaultContextType,
    type VaultStateContextType,
    type VaultActionsContextType
} from '../context/VaultContext';

export function useVaultState(): VaultStateContextType {
    const context = useContext(VaultStateContext);
    if (!context) {
        throw new Error('useVaultState must be used within a VaultProvider');
    }
    return context;
}

export function useVaultActions(): VaultActionsContextType {
    const context = useContext(VaultActionsContext);
    if (!context) {
        throw new Error('useVaultActions must be used within a VaultProvider');
    }
    return context;
}

export function useVault(): VaultContextType {
    const context = useContext(VaultContext);
    if (!context) {
        throw new Error('useVault must be used within a VaultProvider');
    }
    return context;
}
