import { Modal, Stack, MultiSelect, Button, Group, SegmentedControl, Text, TextInput } from '@mantine/core';
import { useState, useEffect } from 'react';
import { useReadCreatorsApiCreatorsGet } from '../../../api/generated/creators/creators';

interface BulkEditModalProps {
    opened: boolean;
    onClose: () => void;
    type: 'artist' | 'tags' | 'delete';
    selectedCount: number;
    onConfirm: (data: any, mode: 'append' | 'replace' | 'remove') => void;
    loading?: boolean;
}

export function BulkEditModal({ opened, onClose, type, selectedCount, onConfirm, loading }: BulkEditModalProps) {
    const [mode, setMode] = useState<'append' | 'replace' | 'remove'>('append');
    const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
    const [tags, setTags] = useState('');

    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 }, { query: { enabled: opened && type === 'artist' } });
    const creatorOptions = (creatorsData?.items || []).map(c => ({
        value: c.id.toString(),
        label: c.canonical_name
    }));

    // Reset on open
    useEffect(() => {
        if (opened) {
            setMode('append');
            setSelectedCreators([]);
            setTags('');
        }
    }, [opened]);

    const handleConfirm = () => {
        if (type === 'artist') {
            onConfirm({ creator_ids: selectedCreators.map(id => parseInt(id)) }, mode);
        } else if (type === 'tags') {
            onConfirm({ tags }, mode);
        } else {
            onConfirm({}, 'replace'); // Delete mode
        }
    };

    const title = type === 'artist' ? 'Bulk Edit Artists' : type === 'tags' ? 'Bulk Edit Tags' : 'Confirm Bulk Delete';

    return (
        <Modal opened={opened} onClose={onClose} title={title} centered>
            <Stack>
                <Text size="sm">
                    Updating <b>{selectedCount}</b> sets.
                </Text>

                {type !== 'delete' && (
                    <>
                        <Text size="xs" fw={500} mb={-10}>Operation Mode</Text>
                        <SegmentedControl
                            fullWidth
                            value={mode}
                            onChange={(v: any) => setMode(v)}
                            data={[
                                { label: 'Append', value: 'append' },
                                { label: 'Replace', value: 'replace' },
                                { label: 'Remove', value: 'remove' },
                            ]}
                        />
                    </>
                )}

                {type === 'artist' && (
                    <MultiSelect
                        label="Select Artists"
                        placeholder="Search artists..."
                        data={creatorOptions}
                        value={selectedCreators}
                        onChange={setSelectedCreators}
                        searchable
                        clearable
                    />
                )}

                {type === 'tags' && (
                    <TextInput
                        label="Tags"
                        placeholder="e.g. nature minimal 4k"
                        description="Space-separated tags"
                        value={tags}
                        onChange={(e) => setTags(e.currentTarget.value)}
                    />
                )}

                {type === 'delete' && (
                    <Text color="red" size="sm">
                        Are you sure you want to delete these {selectedCount} sets? This action cannot be undone and will remove them from the database.
                    </Text>
                )}

                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button 
                        color={type === 'delete' ? 'red' : 'blue'} 
                        onClick={handleConfirm} 
                        loading={loading}
                    >
                        {type === 'delete' ? 'Delete Permanently' : 'Apply Changes'}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
