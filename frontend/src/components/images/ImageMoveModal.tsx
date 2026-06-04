/**
 * @file
 * Module: Image Move Modal
 * Description: A modal for moving images to a different set.
 */
import { useState, useMemo } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { Modal, Stack, Button, Group, Select, Text, Divider, Loader } from '@mantine/core';
import { IconFolderPlus } from '@tabler/icons-react';
import { useReadSetsApiSetsGet } from '../../api/generated/sets/sets';
import { useBulkMoveImagesApiImagesBulkMovePost } from '../../api/generated/images/images';
import { CreateSetModal } from '../sets/CreateSetModal';
import { notifications } from '@mantine/notifications';
import type { Set } from '../../api/model';

interface ImageMoveModalProps {
    opened: boolean;
    onClose: () => void;
    selectedImageIds: number[];
    onSuccess: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

export function ImageMoveModal({ opened, onClose, selectedImageIds, onSuccess }: ImageMoveModalProps) {
    const [targetSetId, setTargetSetId] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [debouncedSearch] = useDebouncedValue(searchValue, SEARCH_DEBOUNCE_MS);
    const [selectedSet, setSelectedSet] = useState<{ value: string; label: string } | null>(null);
    
    const { data: setsData, isFetching: isFetchingSets, refetch: refetchSets } = useReadSetsApiSetsGet({ 
        limit: 1000,
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {})
    });
    const bulkMoveMutation = useBulkMoveImagesApiImagesBulkMovePost();

    const isTyping = searchValue !== debouncedSearch;
    const isLoading = isTyping || isFetchingSets;

    const setOptions = useMemo(() => {
        let options: { value: string; label: string }[] = [];
        if (setsData?.items) {
            options = setsData.items.map(s => {
                const creatorNames = s.creators?.map(c => c.canonical_name).join(', ');
                const labelStr = creatorNames 
                    ? `${s.title || 'Untitled Set'} [${creatorNames}]`
                    : s.title || 'Untitled Set';
                return {
                    value: String(s.id),
                    label: labelStr
                };
            }).sort((a, b) => a.label.localeCompare(b.label));
        }

        if (selectedSet && !options.some(o => o.value === selectedSet.value)) {
            options.unshift(selectedSet);
        }

        return options;
    }, [setsData, selectedSet]);

    const handleConfirmMove = async () => {
        if (!targetSetId || selectedImageIds.length === 0) return;

        try {
            const count = await bulkMoveMutation.mutateAsync({
                data: {
                    image_ids: selectedImageIds,
                    target_set_id: Number(targetSetId)
                }
            });
            
            notifications.show({
                title: 'Move Successful',
                message: `Successfully moved ${count} images to the selected set.`,
                color: 'green'
            });
            
            setTargetSetId(null);
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error moving images:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to move images. Ensure the files are not locked by another process.',
                color: 'red'
            });
        }
    };

    const handleCreateSetSuccess = (newSet: Set) => {
        refetchSets();
        setTargetSetId(String(newSet.id));
    };

    return (
        <>
            <Modal 
                opened={opened} 
                trapFocus={!isCreateModalOpen}
                onClose={() => {
                    setTargetSetId(null);
                    setSearchValue('');
                    setSelectedSet(null);
                    onClose();
                }} 
                title="Move Images to Set"
                size="md"
                radius="md"
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        Select a destination set for the {selectedImageIds.length} selected images. The files will be physically moved to the new set's folder.
                    </Text>
                    
                        <Select
                            label="Destination Set"
                            placeholder="Search sets..."
                            data={setOptions}
                            value={targetSetId}
                            onChange={(val) => {
                                setTargetSetId(val);
                                if (val) {
                                    const option = setOptions.find(o => o.value === val);
                                    if (option) setSelectedSet(option);
                                } else {
                                    setSelectedSet(null);
                                }
                            }}
                            onSearchChange={setSearchValue}
                            searchable
                            clearable
                            nothingFoundMessage={isLoading ? "Loading..." : "No sets found"}
                            maxDropdownHeight={280}
                            rightSection={isLoading ? <Loader size="xs" /> : null}
                            filter={({ options }) => isLoading ? [] : options}
                        />

                    <Divider label="OR" labelPosition="center" />
                    
                    <Button 
                        variant="light" 
                        leftSection={<IconFolderPlus size={16} />}
                        onClick={() => setIsCreateModalOpen(true)}
                    >
                        Create New Set
                    </Button>
                    
                    <Group justify="flex-end" mt="md">
                        <Button variant="subtle" onClick={onClose}>Cancel</Button>
                        <Button 
                            onClick={handleConfirmMove} 
                            loading={bulkMoveMutation.isPending}
                            disabled={!targetSetId}
                            color="blue"
                        >
                            Move Images
                        </Button>
                    </Group>
                </Stack>
            </Modal>
            
            <CreateSetModal 
                opened={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={handleCreateSetSuccess}
            />
        </>
    );
}
