import { Modal, Stack, Radio, Text, Button, Alert, Group, Paper } from '@mantine/core';
import { IconAlertCircle, IconGitMerge } from '@tabler/icons-react';
import { useState } from 'react';
import type { Set as SetModel } from '../../../api/model';

interface MergeSetsModalProps {
    opened: boolean;
    onClose: () => void;
    selectedSets: SetModel[];
    onConfirm: (targetId: number) => void;
    loading: boolean;
}

export function MergeSetsModal({ opened, onClose, selectedSets, onConfirm, loading }: MergeSetsModalProps) {
    const [targetId, setTargetId] = useState<string | null>(null);

    return (
        <Modal opened={opened} onClose={onClose} title="Merge Sets" size="md" radius="md">
            <Stack gap="md">
                <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
                    Merging will move all images into the selected target folder. Source sets will be deleted, and their creators/tags will be combined into the target set.
                </Alert>
                
                <Text size="sm" fw={500}>Choose the target set to keep:</Text>
                
                <Radio.Group value={targetId || ''} onChange={setTargetId}>
                    <Stack gap="xs">
                        {selectedSets.map((s) => (
                            <Paper 
                                withBorder 
                                p="sm" 
                                key={s.id} 
                                radius="md" 
                                style={{ 
                                    cursor: 'pointer',
                                    borderColor: targetId === String(s.id) ? 'var(--mantine-color-blue-filled)' : undefined,
                                    backgroundColor: targetId === String(s.id) ? 'var(--mantine-color-blue-light)' : undefined
                                }} 
                                onClick={() => setTargetId(String(s.id))}
                            >
                                <Group wrap="nowrap" align="flex-start">
                                    <Radio value={String(s.id)} mt={4} />
                                    <Stack gap={0}>
                                        <Text size="sm" fw={600} lineClamp={1}>{s.title || 'Untitled'}</Text>
                                        <Text size="xs" c="dimmed" lineClamp={1}>{s.images?.length || 0} images • {s.local_path}</Text>
                                    </Stack>
                                </Group>
                            </Paper>
                        ))}
                    </Stack>
                </Radio.Group>

                <Button 
                    fullWidth 
                    leftSection={<IconGitMerge size={18} />} 
                    disabled={!targetId} 
                    loading={loading}
                    onClick={() => targetId && onConfirm(Number(targetId))}
                    mt="md"
                    color="blue"
                    size="md"
                >
                    Execute Merge
                </Button>
            </Stack>
        </Modal>
    );
}
