/**
 * @file
 * Vault Provider component.
 * Manages active vault switching, persistent registry state, health statuses,
 * React Query cache invalidation, and dynamic Axios base URL/headers synchronization.
 * Delegates platform-specific storage and networking to a VaultStorageAdapter strategy.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { AXIOS_INSTANCE } from '../api/axios-instance';
import {
    VaultContext,
    VaultStateContext,
    VaultActionsContext,
    type VaultStateContextType,
    type VaultActionsContextType,
    type VaultContextType
} from './VaultContext';
import { VaultEventContext, type VaultEventContextType } from './VaultEventContext';
import {
    type VaultStorageAdapter,
    DEFAULT_LOCAL_VAULT,
    DEFAULT_REGISTRY
} from './adapters/VaultStorageAdapter';
import { ElectronVaultAdapter } from './adapters/ElectronVaultAdapter';
import { WebLocalStorageVaultAdapter } from './adapters/WebLocalStorageVaultAdapter';
import type { VaultEntry, VaultRegistryData, TestConnectionResult } from '../types/electron';

interface VaultProviderProps {
    children: React.ReactNode;
    adapter?: VaultStorageAdapter;
}

export function VaultProvider({ children, adapter: propAdapter }: VaultProviderProps) {
    const adapter = useMemo<VaultStorageAdapter>(() => {
        if (propAdapter) return propAdapter;
        const isElectron = typeof window !== 'undefined' && 'electron' in window && !!window.electron?.getVaultRegistry;
        return isElectron ? new ElectronVaultAdapter() : new WebLocalStorageVaultAdapter();
    }, [propAdapter]);

    const queryClient = useQueryClient();

    const [registry, setRegistry] = useState<VaultRegistryData>(() => {
        return adapter.loadRegistrySync?.() ?? DEFAULT_REGISTRY;
    });
    const registryRef = useRef(registry);
    useEffect(() => {
        registryRef.current = registry;
    }, [registry]);

    const [isLoading, setIsLoading] = useState(true);
    const [isAggregated, setIsAggregatedState] = useState<boolean>(() => {
        return localStorage.getItem('vault_aggregated_mode') === 'true';
    });

    // Vault switch event listener callbacks (replaces DOM CustomEvent('vault-switched'))
    const vaultSwitchListenersRef = useRef<Set<(vault: VaultEntry) => void>>(new Set());

    const onVaultSwitch = useCallback((callback: (vault: VaultEntry) => void) => {
        vaultSwitchListenersRef.current.add(callback);
        return () => {
            vaultSwitchListenersRef.current.delete(callback);
        };
    }, []);

    const setAggregated = useCallback((val: boolean) => {
        setIsAggregatedState(val);
        localStorage.setItem('vault_aggregated_mode', val ? 'true' : 'false');
        queryClient.clear();
    }, [queryClient]);

    const activeVault = useMemo(() => {
        return registry.vaults.find(v => v.id === registry.activeVaultId) || registry.vaults[0] || DEFAULT_LOCAL_VAULT;
    }, [registry.vaults, registry.activeVaultId]);

    const onlineVaults = useMemo(() => {
        return registry.vaults.filter(v => v.isLocal || v.status === 'online');
    }, [registry.vaults]);

    // Apply active vault settings to Axios and localStorage
    const applyVaultConnection = useCallback((vault: VaultEntry) => {
        const cleanUrl = vault.url.replace(/\/+$/, '');
        AXIOS_INSTANCE.defaults.baseURL = cleanUrl;
        localStorage.setItem('backend_url', cleanUrl);
        if (vault.apiKey) {
            localStorage.setItem('api_key', vault.apiKey);
        } else {
            localStorage.removeItem('api_key');
        }
    }, []);

    // Initial load and subscription to adapter updates
    useEffect(() => {
        let isMounted = true;

        const initRegistry = async () => {
            try {
                const data = await adapter.loadRegistry();
                if (isMounted && data && Array.isArray(data.vaults) && data.vaults.length > 0) {
                    setRegistry(data);
                    const currentActive = data.vaults.find(v => v.id === data.activeVaultId) || data.vaults[0];
                    if (currentActive) {
                        applyVaultConnection(currentActive);
                    }
                } else if (isMounted) {
                    const current = registryRef.current;
                    const currentActive = current.vaults.find(v => v.id === current.activeVaultId) || current.vaults[0];
                    if (currentActive) {
                        applyVaultConnection(currentActive);
                    }
                }
            } catch (err) {
                console.error('[VaultProvider] Failed to load registry from adapter:', err);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        initRegistry();

        const unsubscribe = adapter.subscribeToUpdates?.((data: VaultRegistryData) => {
            if (isMounted && data && Array.isArray(data.vaults)) {
                setRegistry(data);
            }
        });

        return () => {
            isMounted = false;
            unsubscribe?.();
        };
    }, [adapter, applyVaultConnection]);

    const switchVault = useCallback(async (vaultId: string) => {
        if (vaultId === 'all') {
            setIsAggregatedState(true);
            localStorage.setItem('vault_aggregated_mode', 'true');
            queryClient.clear();
            notifications.show({
                title: 'Aggregated View',
                message: 'Viewing aggregated library across all online vaults.',
                color: 'blue'
            });
            return;
        }

        // Switching to a specific vault turns off aggregated mode
        setIsAggregatedState(false);
        localStorage.setItem('vault_aggregated_mode', 'false');

        const currentRegistry = registryRef.current;
        const targetVault = currentRegistry.vaults.find(v => v.id === vaultId);
        if (!targetVault) {
            console.error(`[VaultProvider] Cannot switch to non-existent vault: ${vaultId}`);
            return;
        }

        // Apply connection settings
        applyVaultConnection(targetVault);

        const newRegistry = await adapter.setActiveVault(vaultId, currentRegistry);
        setRegistry(newRegistry);

        // Invalidate and clear all cached React Query results
        queryClient.clear();

        // Check if on a resource-specific detail route (e.g. #/sets/123, #/creators/456, #/playlists/789)
        const currentHash = window.location.hash || '';
        const isDetailRoute = /#\/(sets|creators|playlists)\/[^/]+/.test(currentHash);
        if (isDetailRoute) {
            window.location.hash = '#/';
        }

        // Notify registered listeners (e.g. TaskProvider SSE stream)
        vaultSwitchListenersRef.current.forEach((listener) => {
            try {
                listener(targetVault);
            } catch (err) {
                console.error('[VaultProvider] Error in vault-switched listener:', err);
            }
        });

        notifications.show({
            title: 'Switched Vault',
            message: `Active vault context changed to "${targetVault.label}".`,
            color: 'blue'
        });
    }, [adapter, applyVaultConnection, queryClient]);

    const testConnection = useCallback(async (url: string, apiKey?: string): Promise<TestConnectionResult> => {
        return await adapter.testConnection(url, apiKey);
    }, [adapter]);

    const addVault = useCallback(async (payload: { label: string; url: string; apiKey?: string }): Promise<VaultEntry> => {
        const { vault, registry: newRegistry } = await adapter.addVault(payload, registryRef.current);
        setRegistry(newRegistry);
        return vault;
    }, [adapter]);

    const updateVault = useCallback(async (id: string, updates: Partial<{ label: string; url: string; apiKey: string }>): Promise<VaultEntry> => {
        const { vault, registry: newRegistry } = await adapter.updateVault(id, updates, registryRef.current);
        setRegistry(newRegistry);
        if (newRegistry.activeVaultId === id) {
            applyVaultConnection(vault);
        }
        return vault;
    }, [adapter, applyVaultConnection]);

    const removeVault = useCallback(async (id: string): Promise<void> => {
        const currentRegistry = registryRef.current;
        const isRemovingActive = currentRegistry.activeVaultId === id;

        const newRegistry = await adapter.removeVault(id, currentRegistry);
        setRegistry(newRegistry);

        if (isRemovingActive) {
            const newActive = newRegistry.vaults.find(v => v.id === newRegistry.activeVaultId) || newRegistry.vaults[0];
            if (newActive) {
                applyVaultConnection(newActive);
            }

            queryClient.clear();

            const currentHash = window.location.hash || '';
            const isDetailRoute = /#\/(sets|creators|playlists)\/[^/]+/.test(currentHash);
            if (isDetailRoute) {
                window.location.hash = '#/';
            }

            if (newActive) {
                vaultSwitchListenersRef.current.forEach((listener) => {
                    try {
                        listener(newActive);
                    } catch (err) {
                        console.error('[VaultProvider] Error in vault-switched listener:', err);
                    }
                });
            }
        }
    }, [adapter, applyVaultConnection, queryClient]);

    const refreshHealth = useCallback(async (): Promise<void> => {
        const newRegistry = await adapter.refreshHealth(registryRef.current);
        setRegistry(newRegistry);
    }, [adapter]);

    const stateValue = useMemo<VaultStateContextType>(() => ({
        vaults: registry.vaults,
        onlineVaults,
        activeVault,
        isAggregated,
        isLoading
    }), [registry.vaults, onlineVaults, activeVault, isAggregated, isLoading]);

    const actionsValue = useMemo<VaultActionsContextType>(() => ({
        switchVault,
        addVault,
        updateVault,
        removeVault,
        testConnection,
        refreshHealth,
        setAggregated
    }), [switchVault, addVault, updateVault, removeVault, testConnection, refreshHealth, setAggregated]);

    const eventValue = useMemo<VaultEventContextType>(() => ({
        onVaultSwitch
    }), [onVaultSwitch]);

    const combinedValue = useMemo<VaultContextType>(() => ({
        ...stateValue,
        ...actionsValue
    }), [stateValue, actionsValue]);

    return (
        <VaultStateContext.Provider value={stateValue}>
            <VaultActionsContext.Provider value={actionsValue}>
                <VaultEventContext.Provider value={eventValue}>
                    <VaultContext.Provider value={combinedValue}>
                        {children}
                    </VaultContext.Provider>
                </VaultEventContext.Provider>
            </VaultActionsContext.Provider>
        </VaultStateContext.Provider>
    );
}
