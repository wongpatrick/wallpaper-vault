/**
 * @file
 * Modal dialog for adding or editing a remote vault connection.
 * Includes interactive connection testing with status feedback.
 */
import React, { useState, useEffect } from 'react';
import {
    Modal,
    Stack,
    TextInput,
    PasswordInput,
    Button,
    Group,
    Text,
    Alert,
    ThemeIcon,
    Loader
} from '@mantine/core';
import {
    IconCheck,
    IconAlertCircle,
    IconPlug,
    IconServer
} from '@tabler/icons-react';
import { useVault } from '../../hooks/useVault';
import type { VaultEntry, TestConnectionResult } from '../../types/electron';

interface AddVaultModalProps {
    opened: boolean;
    onClose: () => void;
    editingVault?: VaultEntry | null;
    onSaveSuccess?: () => void;
}

export function AddVaultModal({ opened, onClose, editingVault, onSaveSuccess }: AddVaultModalProps) {
    const { addVault, updateVault, testConnection } = useVault();

    const [label, setLabel] = useState('');
    const [url, setUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

    const isEditMode = !!editingVault;
    const isLocal = editingVault?.isLocal || false;

    useEffect(() => {
        if (opened) {
            if (editingVault) {
                setLabel(editingVault.label);
                setUrl(editingVault.url);
                setApiKey(editingVault.apiKey || '');
            } else {
                setLabel('');
                setUrl('');
                setApiKey('');
            }
            setTestResult(null);
            setIsTesting(false);
            setIsSaving(false);
        }
    }, [opened, editingVault]);

    const handleTest = async () => {
        if (!url) return;
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await testConnection(url, apiKey);
            setTestResult(res);
            if (res.success && res.vaultName && !label) {
                setLabel(res.vaultName);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Testing connection failed';
            setTestResult({
                success: false,
                status: 'offline',
                error: msg
            });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url && !isLocal) return;

        setIsSaving(true);
        try {
            if (isEditMode && editingVault) {
                await updateVault(editingVault.id, {
                    label: label.trim() || editingVault.label,
                    url: url.trim(),
                    apiKey: apiKey.trim()
                });
            } else {
                await addVault({
                    label: label.trim() || 'Remote Vault',
                    url: url.trim(),
                    apiKey: apiKey.trim()
                });
            }
            onClose();
            if (onSaveSuccess) onSaveSuccess();
        } catch (err) {
            console.error('Failed to save vault:', err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="xs">
                    <ThemeIcon color="blue" variant="light" size="md">
                        <IconServer size={18} />
                    </ThemeIcon>
                    <Text fw={600}>{isEditMode ? 'Edit Vault' : 'Connect Remote Vault'}</Text>
                </Group>
            }
            centered
            radius="md"
        >
            <form onSubmit={handleSave}>
                <Stack gap="md">
                    <TextInput
                        label="Vault Label"
                        placeholder="e.g. NAS Upstairs or Living Room Server"
                        value={label}
                        onChange={(e) => setLabel(e.currentTarget.value)}
                        description="A friendly nickname for this vault."
                    />

                    <TextInput
                        label="Server URL"
                        placeholder="http://192.168.1.50:8000"
                        value={url}
                        onChange={(e) => {
                            setUrl(e.currentTarget.value);
                            setTestResult(null);
                        }}
                        disabled={isLocal}
                        required={!isLocal}
                        description={isLocal ? "Local vault URL is fixed to the local backend port." : "The HTTP or HTTPS base URL of the remote Wallpaper Vault backend."}
                    />

                    <PasswordInput
                        label="API Key"
                        placeholder="Secret API key (if configured)"
                        value={apiKey}
                        onChange={(e) => {
                            setApiKey(e.currentTarget.value);
                            setTestResult(null);
                        }}
                        disabled={isLocal}
                        description="Required if the target backend has API security authentication enabled."
                    />

                    {/* Test feedback */}
                    {testResult && (
                        testResult.success ? (
                            <Alert
                                icon={<IconCheck size={16} />}
                                title="Connection Successful"
                                color="green"
                                radius="md"
                            >
                                Connected to <strong>{testResult.vaultName || 'Vault'}</strong> (v{testResult.version || '0.1.0'}).
                            </Alert>
                        ) : (
                            <Alert
                                icon={<IconAlertCircle size={16} />}
                                title={testResult.status === 'unauthorized' ? 'Authentication Failed' : 'Connection Failed'}
                                color={testResult.status === 'unauthorized' ? 'yellow' : 'red'}
                                radius="md"
                            >
                                {testResult.error || 'Could not reach vault at specified URL.'}
                            </Alert>
                        )
                    )}

                    <Group justify="space-between" mt="md">
                        <Button
                            variant="light"
                            color="gray"
                            leftSection={isTesting ? <Loader size={14} color="gray" /> : <IconPlug size={16} />}
                            onClick={handleTest}
                            disabled={!url || isTesting}
                        >
                            Test Connection
                        </Button>

                        <Group gap="xs">
                            <Button variant="subtle" color="gray" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                color="blue"
                                loading={isSaving}
                                disabled={!isLocal && !url}
                            >
                                {isEditMode ? 'Save Changes' : 'Add Vault'}
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
