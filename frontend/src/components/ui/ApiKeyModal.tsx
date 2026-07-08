/**
 * @file
 * ApiKeyModal component.
 * Opens automatically when a 401 Unauthorized event is intercepted,
 * prompting the user to supply the backend access token/API Key.
 */

import React, { useState, useEffect } from 'react';
import { Modal, TextInput, Button, Stack, Text, ThemeIcon, Group } from '@mantine/core';
import { IconKey, IconRotate } from '@tabler/icons-react';

export default function ApiKeyModal() {
    const [opened, setOpened] = useState(false);
    const [apiKey, setApiKey] = useState('');

    useEffect(() => {
        const handleUnauthorized = () => {
            setOpened(true);
        };
        window.addEventListener('unauthorized-api-call', handleUnauthorized);
        return () => {
            window.removeEventListener('unauthorized-api-call', handleUnauthorized);
        };
    }, []);

    const handleSave = () => {
        localStorage.setItem('api_key', apiKey.trim());
        setOpened(false);
        // Reload to force Axios requests to rerun with the new credentials
        window.location.reload();
    };

    return (
        <Modal
            opened={opened}
            onClose={() => setOpened(false)}
            title={
                <Group gap="xs">
                    <ThemeIcon color="yellow" variant="light" size="md">
                        <IconKey size={18} />
                    </ThemeIcon>
                    <Text fw={700}>API Key Required</Text>
                </Group>
            }
            centered
            closeOnClickOutside={false}
            closeOnEscape={false}
            withCloseButton={false}
            styles={{
                header: {
                    borderBottom: '1px solid var(--mantine-color-default-border)'
                },
                content: {
                    background: 'rgba(23, 26, 32, 0.95)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
                }
            }}
        >
            <Stack gap="md" mt="xs">
                <Text size="sm" c="dimmed">
                    The backend service requires token/API key authentication for secure network hosting. Please enter the pre-shared secret key.
                </Text>
                
                <TextInput
                    placeholder="Enter pre-shared API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    type="password"
                    autoFocus
                    leftSection={<IconKey size={16} />}
                />
                
                <Button 
                    onClick={handleSave} 
                    disabled={!apiKey.trim()}
                    color="yellow" 
                    leftSection={<IconRotate size={16} />}
                >
                    Save & Reconnect
                </Button>
            </Stack>
        </Modal>
    );
}
