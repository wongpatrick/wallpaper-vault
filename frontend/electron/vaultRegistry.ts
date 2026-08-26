/**
 * @file
 * Vault Registry Manager for Electron main process.
 * Manages persistence, active context, connection testing, and background health monitoring for multiple vaults.
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

export interface VaultEntry {
    id: string;
    label: string;
    url: string;
    apiKey?: string;
    isLocal: boolean;
    status?: 'online' | 'offline' | 'unauthorized';
    lastSeen?: string;
    vaultId?: string;
    vaultName?: string;
    version?: string;
}

export interface VaultRegistryData {
    activeVaultId: string;
    vaults: VaultEntry[];
}

export interface TestConnectionResult {
    success: boolean;
    status: 'online' | 'offline' | 'unauthorized';
    vaultId?: string;
    vaultName?: string;
    version?: string;
    error?: string;
}

const HEALTH_CHECK_INTERVAL_MS = 30000;
const HTTP_TIMEOUT_MS = 3500;
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_DEFAULT_PORT = 80;
const HTTPS_DEFAULT_PORT = 443;

export class VaultRegistryManager {
    private registryPath: string;
    private data: VaultRegistryData;
    private healthTimer: NodeJS.Timeout | null = null;
    private onUpdateCallback: ((data: VaultRegistryData) => void) | null = null;
    private getLocalPort: () => number;

    constructor(getLocalPort: () => number) {
        this.getLocalPort = getLocalPort;
        this.registryPath = path.join(app.getPath('userData'), 'vault-registry.json');
        this.data = this.loadRegistry();
    }

    private getCleanUrl(rawUrl: string): string {
        return rawUrl.trim().replace(/\/+$/, '');
    }

    private loadRegistry(): VaultRegistryData {
        const localPort = this.getLocalPort();
        const localUrl = `http://localhost:${localPort}`;

        const defaultData: VaultRegistryData = {
            activeVaultId: 'local-vault',
            vaults: [
                {
                    id: 'local-vault',
                    label: 'Local',
                    url: localUrl,
                    apiKey: '',
                    isLocal: true,
                    status: 'online'
                }
            ]
        };

        try {
            if (fs.existsSync(this.registryPath)) {
                const raw = fs.readFileSync(this.registryPath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.vaults) && parsed.vaults.length > 0) {
                    // Ensure local vault exists and is pinned
                    let localVault = parsed.vaults.find((v: VaultEntry) => v.isLocal);
                    if (!localVault) {
                        localVault = {
                            id: 'local-vault',
                            label: 'Local',
                            url: localUrl,
                            apiKey: '',
                            isLocal: true,
                            status: 'online'
                        };
                        parsed.vaults.unshift(localVault);
                    } else {
                        // Update local vault URL with current port
                        localVault.url = localUrl;
                    }

                    const activeExists = parsed.vaults.some((v: VaultEntry) => v.id === parsed.activeVaultId);
                    if (!activeExists) {
                        parsed.activeVaultId = localVault.id;
                    }

                    return parsed;
                }
            }
        } catch (err) {
            console.error('[VaultRegistry] Failed to load registry file:', err);
        }

        this.saveRegistry(defaultData);
        return defaultData;
    }

    private saveRegistry(data?: VaultRegistryData): void {
        const toSave = data || this.data;
        try {
            fs.writeFileSync(this.registryPath, JSON.stringify(toSave, null, 2), 'utf-8');
        } catch (err) {
            console.error('[VaultRegistry] Failed to save registry file:', err);
        }
    }

    public getRegistry(): VaultRegistryData {
        // Sync local URL with current port
        const localPort = this.getLocalPort();
        const localUrl = `http://localhost:${localPort}`;
        const local = this.data.vaults.find(v => v.isLocal);
        if (local && local.url !== localUrl) {
            local.url = localUrl;
            this.saveRegistry();
        }
        return this.data;
    }

    public getActiveVault(): VaultEntry {
        const reg = this.getRegistry();
        const active = reg.vaults.find(v => v.id === reg.activeVaultId);
        return active || reg.vaults[0];
    }

    public setActiveVault(vaultId: string): VaultEntry {
        const vault = this.data.vaults.find(v => v.id === vaultId);
        if (!vault) {
            throw new Error(`Vault with id ${vaultId} not found`);
        }
        this.data.activeVaultId = vault.id;
        this.saveRegistry();
        this.notifyUpdate();
        return vault;
    }

    public async addVault(payload: { label: string; url: string; apiKey?: string }): Promise<VaultEntry> {
        const cleanUrl = this.getCleanUrl(payload.url);
        const apiKey = payload.apiKey?.trim() || '';
        const id = crypto.randomUUID();

        const newEntry: VaultEntry = {
            id,
            label: payload.label.trim() || 'Remote Vault',
            url: cleanUrl,
            apiKey,
            isLocal: false,
            status: 'offline'
        };

        // Test connection immediately to populate identity
        const testResult = await this.testConnection(cleanUrl, apiKey);
        newEntry.status = testResult.status;
        if (testResult.success) {
            newEntry.vaultId = testResult.vaultId;
            newEntry.vaultName = testResult.vaultName;
            newEntry.version = testResult.version;
            newEntry.lastSeen = new Date().toISOString();
        }

        this.data.vaults.push(newEntry);
        this.saveRegistry();
        this.notifyUpdate();
        return newEntry;
    }

    public async updateVault(id: string, updates: Partial<{ label: string; url: string; apiKey: string }>): Promise<VaultEntry> {
        const vault = this.data.vaults.find(v => v.id === id);
        if (!vault) {
            throw new Error(`Vault with id ${id} not found`);
        }

        if (updates.label !== undefined) {
            vault.label = updates.label.trim();
        }

        if (!vault.isLocal) {
            if (updates.url !== undefined) {
                vault.url = this.getCleanUrl(updates.url);
            }
            if (updates.apiKey !== undefined) {
                vault.apiKey = updates.apiKey.trim();
            }
        }

        // Test updated connection
        const testResult = await this.testConnection(vault.url, vault.apiKey);
        vault.status = testResult.status;
        if (testResult.success) {
            vault.vaultId = testResult.vaultId;
            vault.vaultName = testResult.vaultName;
            vault.version = testResult.version;
            vault.lastSeen = new Date().toISOString();
        }

        this.saveRegistry();
        this.notifyUpdate();
        return vault;
    }

    public removeVault(id: string): VaultRegistryData {
        const vault = this.data.vaults.find(v => v.id === id);
        if (!vault) {
            throw new Error(`Vault with id ${id} not found`);
        }
        if (vault.isLocal) {
            throw new Error('Local vault is pinned and cannot be removed');
        }

        this.data.vaults = this.data.vaults.filter(v => v.id !== id);
        if (this.data.activeVaultId === id) {
            const local = this.data.vaults.find(v => v.isLocal) || this.data.vaults[0];
            this.data.activeVaultId = local.id;
        }

        this.saveRegistry();
        this.notifyUpdate();
        return this.data;
    }

    public testConnection(url: string, apiKey?: string): Promise<TestConnectionResult> {
        return new Promise((resolve) => {
            const cleanUrl = this.getCleanUrl(url);
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(cleanUrl);
            } catch {
                return resolve({
                    success: false,
                    status: 'offline',
                    error: 'Invalid URL format'
                });
            }

            const isHttps = parsedUrl.protocol === 'https:';
            const client = isHttps ? https : http;
            const port = parsedUrl.port || (isHttps ? HTTPS_DEFAULT_PORT : HTTP_DEFAULT_PORT);

            const headers: Record<string, string> = {};
            if (apiKey) {
                headers['X-API-Key'] = apiKey;
            }

            const endpointPath = `${parsedUrl.pathname.replace(/\/+$/, '')}/api/vault/identity`;

            const req = client.request({
                hostname: parsedUrl.hostname,
                port: port,
                path: endpointPath,
                method: 'GET',
                headers: headers,
                timeout: HTTP_TIMEOUT_MS
            }, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode === HTTP_STATUS_OK) {
                        try {
                            const json = JSON.parse(body);
                            resolve({
                                success: true,
                                status: 'online',
                                vaultId: json.vault_id,
                                vaultName: json.vault_name,
                                version: json.version
                            });
                        } catch {
                            resolve({
                                success: true,
                                status: 'online'
                            });
                        }
                    } else if (res.statusCode === HTTP_STATUS_UNAUTHORIZED) {
                        resolve({
                            success: false,
                            status: 'unauthorized',
                            error: 'Unauthorized: Invalid or missing API key'
                        });
                    } else {
                        resolve({
                            success: false,
                            status: 'offline',
                            error: `Server returned HTTP status ${res.statusCode}`
                        });
                    }
                });
            });

            req.on('error', (err) => {
                resolve({
                    success: false,
                    status: 'offline',
                    error: err.message || 'Connection failed'
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    status: 'offline',
                    error: 'Connection timed out'
                });
            });

            req.end();
        });
    }

    public startHealthMonitoring(onUpdate: (data: VaultRegistryData) => void): void {
        this.onUpdateCallback = onUpdate;
        if (this.healthTimer) {
            clearInterval(this.healthTimer);
        }

        const runCheck = async () => {
            let changed = false;
            for (const vault of this.data.vaults) {
                const res = await this.testConnection(vault.url, vault.apiKey);
                const oldStatus = vault.status;
                vault.status = res.status;
                if (res.success) {
                    vault.vaultId = res.vaultId;
                    vault.vaultName = res.vaultName;
                    vault.version = res.version;
                    vault.lastSeen = new Date().toISOString();
                }
                if (oldStatus !== vault.status) {
                    changed = true;
                }
            }

            if (changed) {
                this.saveRegistry();
                this.notifyUpdate();
            }

            // Push remote vault health status to local backend
            this.pushHealthToBackend();
        };

        runCheck();
        this.healthTimer = setInterval(runCheck, HEALTH_CHECK_INTERVAL_MS);
    }

    private pushHealthToBackend(): void {
        const localPort = this.getLocalPort();
        const localVault = this.data.vaults.find((v) => v.isLocal);
        const localApiKey = localVault?.apiKey || '';

        const updates = this.data.vaults
            .filter((v) => !v.isLocal && v.vaultId)
            .map((v) => ({
                vault_id: v.vaultId,
                url: v.url,
                is_online: v.status === 'online',
                vault_name: v.vaultName || v.label,
                api_key: v.apiKey || null
            }));

        if (updates.length === 0) return;

        const bodyData = JSON.stringify(updates);
        const options: http.RequestOptions = {
            hostname: '127.0.0.1',
            port: localPort,
            path: '/api/vault/health',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyData),
                ...(localApiKey ? { 'X-API-Key': localApiKey } : {})
            },
            timeout: HTTP_TIMEOUT_MS
        };

        const req = http.request(options, (res) => {
            res.resume();
        });
        req.on('error', () => {
            // Ignored if local backend is starting up or unavailable
        });
        req.on('timeout', () => {
            req.destroy();
        });
        req.write(bodyData);
        req.end();
    }

    public stopHealthMonitoring(): void {
        if (this.healthTimer) {
            clearInterval(this.healthTimer);
            this.healthTimer = null;
        }
    }

    private notifyUpdate(): void {
        if (this.onUpdateCallback) {
            this.onUpdateCallback(this.data);
        }
    }
}
