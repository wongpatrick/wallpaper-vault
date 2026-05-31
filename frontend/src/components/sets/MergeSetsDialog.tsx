/**
 * @file MergeSetsDialog component for merging multiple sets together.
 */
import { useState } from 'react';
import { 
    Modal, Button, Stack, Checkbox, Text, Group, Alert, 
    Stepper, Radio, ScrollArea
} from '@mantine/core';
import { IconAlertCircle, IconArrowRight, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useMergeSetsApiSetsMergePost } from '../../api/generated/sets/sets';
import type { Set } from '../../api/model';

interface MergeSetsDialogProps {
    opened: boolean;
    onClose: () => void;
    sets: Set[];
    onSuccess: () => void;
}

export function MergeSetsDialog({ opened, onClose, sets, onSuccess }: MergeSetsDialogProps) {
    const [activeStep, setActiveStep] = useState(0);
    const [selectedSetIds, setSelectedSetIds] = useState<number[]>([]);
    const [targetSetId, setTargetSetId] = useState<number | null>(null);

    const mergeMutation = useMergeSetsApiSetsMergePost();

    const handleClose = () => {
        if (!mergeMutation.isPending) {
            setActiveStep(0);
            setSelectedSetIds([]);
            setTargetSetId(null);
            onClose();
        }
    };

    const handleNext = () => {
        if (activeStep === 0) {
            if (selectedSetIds.length < 2) {
                notifications.show({ title: 'Error', message: 'Please select at least 2 sets to merge', color: 'red' });
                return;
            }
            // Auto-select first if none selected
            if (!targetSetId || !selectedSetIds.includes(targetSetId)) {
                setTargetSetId(selectedSetIds[0]);
            }
        }
        setActiveStep((current) => current + 1);
    };

    const handleBack = () => {
        setActiveStep((current) => current - 1);
    };

    const handleMerge = async () => {
        if (!targetSetId || selectedSetIds.length < 2) return;

        try {
            await mergeMutation.mutateAsync({
                data: {
                    source_ids: selectedSetIds,
                    target_id: targetSetId
                }
            });
            notifications.show({ title: 'Success', message: 'Sets merged successfully', color: 'green' });
            onSuccess();
            handleClose();
        } catch (error: unknown) {
            const err = error as { response?: { data?: { detail?: Record<string, unknown> | string } } };
            const detail = err?.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : 'Could not merge sets';
            notifications.show({ title: 'Error', message, color: 'red' });
        }
    };

    const toggleSetSelection = (id: number) => {
        setSelectedSetIds(prev => 
            prev.includes(id) ? prev.filter(setId => setId !== id) : [...prev, id]
        );
    };

    const selectedSets = sets.filter(s => selectedSetIds.includes(s.id));
    const targetSet = sets.find(s => s.id === targetSetId);

    return (
        <Modal 
            opened={opened} 
            onClose={handleClose} 
            title="Merge Sets" 
            size="lg"
            closeOnClickOutside={!mergeMutation.isPending}
            closeOnEscape={!mergeMutation.isPending}
            withCloseButton={!mergeMutation.isPending}
        >
            <Stepper active={activeStep} onStepClick={setActiveStep} allowNextStepsSelect={false} size="sm" mb="xl">
                <Stepper.Step label="Select Sets" description="Choose sets to combine" />
                <Stepper.Step label="Target Set" description="Pick primary set" />
                <Stepper.Step label="Confirm" description="Review & merge" />
            </Stepper>

            {activeStep === 0 && (
                <Stack>
                    <Text size="sm" c="dimmed">Select the sets you want to merge. You must select at least two sets.</Text>
                    <ScrollArea h={300} type="always" offsetScrollbars>
                        <Stack gap="xs">
                            {sets.map(set => (
                                <Checkbox
                                    key={set.id}
                                    label={`${set.title} (${set.images?.length || 0} images)`}
                                    description={set.local_path}
                                    checked={selectedSetIds.includes(set.id)}
                                    onChange={() => toggleSetSelection(set.id)}
                                    size="md"
                                />
                            ))}
                        </Stack>
                    </ScrollArea>
                    <Group justify="flex-end" mt="md">
                        <Button onClick={handleNext} disabled={selectedSetIds.length < 2} rightSection={<IconArrowRight size={16} />}>
                            Next
                        </Button>
                    </Group>
                </Stack>
            )}

            {activeStep === 1 && (
                <Stack>
                    <Text size="sm" c="dimmed">Which set should be the primary set? All other selected sets will be merged into this one, and their old folders will be deleted.</Text>
                    <Radio.Group value={targetSetId?.toString() || ''} onChange={(val) => setTargetSetId(Number(val))}>
                        <Stack gap="sm">
                            {selectedSets.map(set => (
                                <Radio 
                                    key={set.id}
                                    value={set.id.toString()}
                                    label={`${set.title} (${set.images?.length || 0} images)`}
                                    description={set.local_path}
                                />
                            ))}
                        </Stack>
                    </Radio.Group>
                    <Group justify="space-between" mt="md">
                        <Button variant="default" onClick={handleBack}>Back</Button>
                        <Button onClick={handleNext} disabled={!targetSetId} rightSection={<IconArrowRight size={16} />}>
                            Next
                        </Button>
                    </Group>
                </Stack>
            )}

            {activeStep === 2 && (
                <Stack>
                    <Alert icon={<IconAlertCircle size="1rem" />} title="Are you sure?" color="red">
                        This action cannot be easily undone. All images from the other sets will be physically moved into the primary set's folder. The other sets and their old folders will be permanently deleted (only if they are empty of untracked files).
                    </Alert>
                    
                    <Text fw={500}>Primary Set:</Text>
                    <Text c="blue">{targetSet?.title} ({targetSet?.local_path})</Text>

                    <Text fw={500} mt="sm">Sets to be deleted:</Text>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {selectedSets.filter(s => s.id !== targetSetId).map(set => (
                            <li key={set.id}><Text c="red">{set.title}</Text></li>
                        ))}
                    </ul>

                    <Group justify="space-between" mt="xl">
                        <Button variant="default" onClick={handleBack} disabled={mergeMutation.isPending}>Back</Button>
                        <Button 
                            color="red" 
                            onClick={handleMerge} 
                            loading={mergeMutation.isPending}
                            leftSection={<IconCheck size={16} />}
                        >
                            Merge Sets Now
                        </Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
