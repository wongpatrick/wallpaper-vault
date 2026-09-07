/**
 * @file
 * Module: Port Collision Modal
 * Description: Modal dialog allowing users to reconfigure the backend HTTP listening port upon conflict.
 */
import { useState } from 'react';
import { Modal, Stack, Text, NumberInput, Group, Button } from '@mantine/core';

const MIN_PORT = 1024;
const MAX_PORT = 65535;

interface PortCollisionModalProps {
    opened: boolean;
    onClose: () => void;
    initialPort: number;
    onSavePort: (port: number) => Promise<void>;
    isSaving: boolean;
}

export function PortCollisionModal({
    opened,
    onClose,
    initialPort,
    onSavePort,
    isSaving
}: PortCollisionModalProps) {
    const [customPort, setCustomPort] = useState<number>(initialPort);
    const [prevInitialPort, setPrevInitialPort] = useState<number>(initialPort);

    if (initialPort !== prevInitialPort) {
        setPrevInitialPort(initialPort);
        setCustomPort(initialPort);
    }

    const handleSave = async () => {
        await onSavePort(customPort);
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Configure Backend Port"
            centered
            radius="md"
            styles={{
                content: {
                    backgroundColor: '#171a20',
                    color: '#eceff4',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                },
                header: {
                    backgroundColor: '#171a20',
                    color: '#eceff4',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                }
            }}
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    If port 8000 is occupied, you can choose another port (e.g. 8080 or 9000). The application will update its settings and restart the backend on the new port.
                </Text>
                
                <NumberInput
                    label="Custom Port"
                    description={`Enter a port number between ${MIN_PORT} and ${MAX_PORT}`}
                    placeholder="8000"
                    min={MIN_PORT}
                    max={MAX_PORT}
                    value={customPort}
                    onChange={(val) => setCustomPort(Number(val))}
                    required
                    radius="md"
                />

                <Group justify="flex-end" mt="md">
                    <Button 
                        variant="subtle" 
                        color="gray" 
                        onClick={onClose}
                        radius="md"
                    >
                        Cancel
                    </Button>
                    <Button 
                        color="blue" 
                        onClick={handleSave}
                        loading={isSaving}
                        radius="md"
                    >
                        Update & Retry
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
