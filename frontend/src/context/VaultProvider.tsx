/**
 * @file
 * Vault Provider component.
 * Manages active vault switching, persistent registry state, health statuses,
 * React Query cache invalidation, and dynamic Axios base URL/headers synchronization.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { AXIOS_INSTANCE } from '../api/axios-instance';
import { API_BASE_URL } from '../config';
import { VaultContext } from './VaultContext';
import type { VaultEntry, VaultRegistryData, TestConnectionResult } from '../types/electron';

interface VaultProviderProps {
    children: React.ReactNode;
}

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_UNAUTHORIZED = 401;

const DEFAULT_LOCAL_VAULT: VaultEntry = {
    id: 'local-vault',
    label: 'Local',
    url: API_BASE_URL,
    apiKey: '',
    isLocal: true,
    status: 'online'
};

const DEFAULT_REGISTRY: VaultRegistryData = {
    activeVaultId: 'local-vault',
    vaults: [DEFAULT_LOCAL_VAULT]
};

export function VaultProvider({ children }: VaultProviderProps) {
    const isElectron = typeof window !== 'undefined' && 'electron' in window && !!window.electron?.getVaultRegistry;
    const queryClient = useQueryClient();

    const [registry, setRegistry] = useState<VaultRegistryData>(() => {
        if (!isElectron) {
            try {
                const stored = localStorage.getItem('vault_registry');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed && Array.isArray(parsed.vaults) && parsed.vaults.length > 0) {
                        return parsed;
                    }
                }
            } catch {
                // ignore
            }
        }
        return DEFAULT_REGISTRY;
    });

    const [isLoading, setIsLoading] = useState(true);

    const activeVault = registry.vaults.find(v => v.id === registry.activeVaultId) || registry.vaults[0] || DEFAULT_LOCAL_VAULT;

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

    // Initial load and sync
    useEffect(() => {
        let isMounted = true;

        const initRegistry = async () => {
            if (isElectron) {
                try {
                    const data = await window.electron.getVaultRegistry();
                    if (isMounted && data && Array.isArray(data.vaults)) {
                        setRegistry(data);
                        const currentActive = data.vaults.find(v => v.id === data.activeVaultId) || data.vaults[0];
                        if (currentActive) {
                            applyVaultConnection(currentActive);
                        }
                    }
                } catch (err) {
                    console.error('[VaultProvider] Failed to load registry from Electron:', err);
                }
            } else {
                const currentActive = registry.vaults.find(v => v.id === registry.activeVaultId) || registry.vaults[0];
                if (currentActive) {
                    applyVaultConnection(currentActive);
                }
            }
            if (isMounted) {
                setIsLoading(false);
            }
        };

        initRegistry();

        // Listen for live updates from Electron
        if (isElectron) {
            const unsubscribe = window.electron.onVaultRegistryUpdated((data: VaultRegistryData) => {
                if (isMounted && data && Array.isArray(data.vaults)) {
                    setRegistry(data);
                }
            });
            return () => {
                isMounted = false;
                unsubscribe();
            };
        }

        return () => {
            isMounted = false;
        };
    }, [isElectron, applyVaultConnection, registry.activeVaultId, registry.vaults]);

    const switchVault = useCallback(async (vaultId: string) => {
        const targetVault = registry.vaults.find(v => v.id === vaultId);
        if (!targetVault) {
            console.error(`[VaultProvider] Cannot switch to non-existent vault: ${vaultId}`);
            return;
        }

        // Apply connection settings
        applyVaultConnection(targetVault);

        if (isElectron) {
            try {
                await window.electron.setActiveVault(vaultId);
            } catch (err) {
                console.error('[VaultProvider] Failed to set active vault in Electron:', err);
            }
        } else {
            const newRegistry = { ...registry, activeVaultId: vaultId };
            setRegistry(newRegistry);
            localStorage.setItem('vault_registry', JSON.stringify(newRegistry));
        }

        // Invalidate and clear all cached React Query results
        queryClient.clear();

        // Check if on a resource-specific detail route (e.g. #/sets/123, #/creators/456, #/playlists/789)
        const currentHash = window.location.hash || '';
        const isDetailRoute = /#\/(sets|creators|playlists)\/[^/]+/.test(currentHash);
        if (isDetailRoute) {
            window.location.hash = '#/';
        }

        // Dispatch window event for other listeners (e.g. SSE stream in TaskProvider)
        window.dispatchEvent(new CustomEvent('vault-switched', { detail: targetVault }));

        notifications.show({
            title: 'Switched Vault',
            message: `Active vault context changed to "${targetVault.label}".`,
            color: 'blue'
        });
    }, [registry, isElectron, applyVaultConnection, queryClient]);

    const testConnection = useCallback(async (url: string, apiKey?: string): Promise<TestConnectionResult> => {
        if (isElectron) {
            return await window.electron.testVaultConnection(url, apiKey);
        }

        // Web mode fallback fetch
        try {
            const cleanUrl = url.trim().replace(/\/+$/, '');
            const headers: Record<string, string> = {};
            if (apiKey) {
                headers['X-API-Key'] = apiKey;
            }
            const res = await fetch(`${cleanUrl}/api/vault/identity`, { headers });
            if (res.status === HTTP_STATUS_OK) {
                const data = await res.json();
                return {
                    success: true,
                    status: 'online',
                    vaultId: data.vault_id,
                    vaultName: data.vault_name,
                    version: data.version
                };
            } else if (res.status === HTTP_STATUS_UNAUTHORIZED) {
                return {
                    success: false,
                    status: 'unauthorized',
                    error: 'Unauthorized: Invalid or missing API key'
                };
            } else {
                return {
                    success: false,
                    status: 'offline',
                    error: `Server returned HTTP ${res.status}`
                };
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Connection failed';
            return {
                success: false,
                status: 'offline',
                error: msg
            };
        }
    }, [isElectron]);

    const addVault = useCallback(async (payload: { label: string; url: string; apiKey?: string }): Promise<VaultEntry> => {
        if (isElectron) {
            const added = await window.electron.addVault(payload);
            const updated = await window.electron.getVaultRegistry();
            setRegistry(updated);
            return added;
        }

        const id = `vault-${Date.now()}`;
        const cleanUrl = payload.url.trim().replace(/\/+$/, '');
        const newEntry: VaultEntry = {
            id,
            label: payload.label.trim() || 'Remote Vault',
            url: cleanUrl,
            apiKey: payload.apiKey?.trim() || '',
            isLocal: false,
            status: 'offline'
        };

        const testRes = await testConnection(cleanUrl, newEntry.apiKey);
        newEntry.status = testRes.status;
        if (testRes.success) {
            newEntry.vaultId = testRes.vaultId;
            newEntry.vaultName = testRes.vaultName;
            newEntry.version = testRes.version;
            newEntry.lastSeen = new Date().toISOString();
        }

        const newRegistry: VaultRegistryData = {
            ...registry,
            vaults: [...registry.vaults, newEntry]
        };
        setRegistry(newRegistry);
        localStorage.setItem('vault_registry', JSON.stringify(newRegistry));
        return newEntry;
    }, [isElectron, registry, testConnection]);

    const updateVault = useCallback(async (id: string, updates: Partial<{ label: string; url: string; apiKey: string }>): Promise<VaultEntry> => {
        if (isElectron) {
            const updated = await window.electron.updateVault(id, updates);
            const freshRegistry = await window.electron.getVaultRegistry();
            setRegistry(freshRegistry);
            if (freshRegistry.activeVaultId === id) {
                applyVaultConnection(updated);
            }
            return updated;
        }

        const vaultIndex = registry.vaults.findIndex(v => v.id === id);
        if (vaultIndex === -1) {
            throw new Error(`Vault with id ${id} not found`);
        }

        const target = { ...registry.vaults[vaultIndex] };
        if (updates.label !== undefined) target.label = updates.label;
        if (!target.isLocal) {
            if (updates.url !== undefined) target.url = updates.url.trim().replace(/\/+$/, '');
            if (updates.apiKey !== undefined) target.apiKey = updates.apiKey.trim();
        }

        const testRes = await testConnection(target.url, target.apiKey);
        target.status = testRes.status;
        if (testRes.success) {
            target.vaultId = testRes.vaultId;
            target.vaultName = testRes.vaultName;
            target.version = testRes.version;
            target.lastSeen = new Date().toISOString();
        }

        const newVaults = [...registry.vaults];
        newVaults[vaultIndex] = target;
        const newRegistry = { ...registry, vaults: newVaults };
        setRegistry(newRegistry);
        localStorage.setItem('vault_registry', JSON.stringify(newRegistry));

        if (registry.activeVaultId === id) {
            applyVaultConnection(target);
        }

        return target;
    }, [isElectron, registry, testConnection, applyVaultConnection]);

    const removeVault = useCallback(async (id: string): Promise<void> => {
        if (isElectron) {
            const updated = await window.electron.removeVault(id);
            setRegistry(updated);
            const newActive = updated.vaults.find(v => v.id === updated.activeVaultId) || updated.vaults[0];
            if (newActive) {
                applyVaultConnection(newActive);
            }
            return;
        }

        const vault = registry.vaults.find(v => v.id === id);
        if (!vault) return;
        if (vault.isLocal) {
            throw new Error('Local vault is pinned and cannot be removed');
        }

        const newVaults = registry.vaults.filter(v => v.id !== id);
        let newActiveId = registry.activeVaultId;
        if (newActiveId === id) {
            newActiveId = newVaults.find(v => v.isLocal)?.id || newVaults[0].id;
        }

        const newRegistry: VaultRegistryData = {
            activeVaultId: newActiveId,
            vaults: newVaults
        };
        setRegistry(newRegistry);
        localStorage.setItem('vault_registry', JSON.stringify(newRegistry));

        const activeObj = newVaults.find(v => v.id === newActiveId) || newVaults[0];
        applyVaultConnection(activeObj);
    }, [isElectron, registry, applyVaultConnection]);

    const refreshHealth = useCallback(async () => {
        if (isElectron) {
            const fresh = await window.electron.getVaultRegistry();
            setRegistry(fresh);
            return;
        }

        const updatedVaults = await Promise.all(
            registry.vaults.map(async (vault) => {
                const res = await testConnection(vault.url, vault.apiKey);
                const updated = { ...vault, status: res.status };
                if (res.success) {
                    updated.vaultId = res.vaultId;
                    updated.vaultName = res.vaultName;
                    updated.version = res.version;
                    updated.lastSeen = new Date().toISOString();
                }
                return updated;
            })
        );

        const newRegistry = { ...registry, vaults: updatedVaults };
        setRegistry(newRegistry);
        localStorage.setItem('vault_registry', JSON.stringify(newRegistry));
    }, [isElectron, registry, testConnection]);

    const contextValue = {
        vaults: registry.vaults,
        activeVault,
        isLoading,
        switchVault,
        addVault,
        updateVault,
        removeVault,
        testConnection,
        refreshHealth
    };

    return (
        <VaultContext.Provider value={contextValue}>
            {children}
        </VaultContext.Provider>
    );
}
