/**
 * @file
 * Hook for consuming VaultContext.
 */
import { useContext } from 'react';
import { VaultContext, type VaultContextType } from '../context/VaultContext';

export function useVault(): VaultContextType {
    const context = useContext(VaultContext);
    if (!context) {
        throw new Error('useVault must be used within a VaultProvider');
    }
    return context;
}
