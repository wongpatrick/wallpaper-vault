/**
 * @file
 * Module: Bulk Edit Modal (Sets)
 * Description: Modal component for applying bulk operations (artists, tags, delete) to multiple selected wallpaper sets.
 */
import { Modal, Stack, MultiSelect, Button, Group, SegmentedControl, Text } from '@mantine/core';
import { useState } from 'react';
import { useReadCreatorsApiCreatorsGet } from '../../api/generated/creators/creators';
import type { SetUpdate, BulkOperationMode } from '../../api/model';
import { TagAutocompleteInput } from '../../components/ui/TagAutocompleteInput';

interface SetBulkEditModalProps {
    opened: boolean;
    onClose: () => void;
    type: 'artist' | 'tags' | 'delete';
    selectedCount: number;
    onConfirm: (data: SetUpdate, mode: BulkOperationMode) => void;
    loading?: boolean;
}

export function SetBulkEditModal({ opened, onClose, type, selectedCount, onConfirm, loading }: SetBulkEditModalProps) {
    const [mode, setMode] = useState<'append' | 'replace' | 'remove'>('append');
    const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
    const [tags, setTags] = useState<string[]>([]);

    const { data: creatorsData } = useReadCreatorsApiCreatorsGet({ limit: 1000 }, { query: { enabled: opened && type === 'artist' } });
    const creatorOptions = (creatorsData?.items || []).map(c => ({
        value: c.id.toString(),
        label: c.canonical_name
    }));

    const handleConfirm = () => {
        if (type === 'artist') {
            onConfirm({ creator_ids: selectedCreators.map(id => parseInt(id)) }, mode);
        } else if (type === 'tags') {
            onConfirm({ tags: tags.join(' ') }, mode);
        } else {
            onConfirm({} as SetUpdate, 'replace' as BulkOperationMode); // Delete mode
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
                            onChange={(v) => setMode(v as BulkOperationMode)}
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
                    <TagAutocompleteInput
                        label="Tags"
                        placeholder="Add tags..."
                        description="Tags to apply to selected sets"
                        value={tags}
                        onChange={setTags}
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
