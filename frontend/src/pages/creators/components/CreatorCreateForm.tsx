import { useState } from 'react';
import { TextInput, Select, Textarea, Button, Stack } from '@mantine/core';
import { useCreateCreatorApiCreatorsPost } from '../../../api/generated/creators/creators';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconAlertCircle } from '@tabler/icons-react';

interface CreatorCreateFormProps {
    onSuccess: () => void;
}

export function CreatorCreateForm({ onSuccess }: CreatorCreateFormProps) {
    const [name, setName] = useState('');
    const [type, setType] = useState<string | null>('Artist');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    const createMutation = useCreateCreatorApiCreatorsPost();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            await createMutation.mutateAsync({
                data: {
                    canonical_name: name.trim(),
                    type: (type as any) || 'Artist',
                    notes: notes.trim() || undefined
                }
            });

            notifications.show({
                title: 'Success',
                message: `Artist "${name}" created successfully.`,
                color: 'green',
                icon: <IconCheck size={16} />
            });
            onSuccess();
        } catch (error: any) {
            const errorMsg = error?.response?.data?.detail || 'Failed to create artist.';
            notifications.show({
                title: 'Error',
                message: errorMsg,
                color: 'red',
                icon: <IconAlertCircle size={16} />
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <Stack gap="md">
                <TextInput
                    label="Artist Name"
                    placeholder="e.g. 蠢沫沫, Sakurajima Mai"
                    required
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    data-autofocus
                />
                <Select
                    label="Type"
                    placeholder="Select artist type"
                    data={['Artist', 'AI Generated', 'Studio', 'Photography']}
                    value={type}
                    onChange={setType}
                />
                <Textarea
                    label="Notes"
                    placeholder="Add any notes about this artist..."
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.currentTarget.value)}
                />
                <Button 
                    type="submit" 
                    fullWidth 
                    loading={loading}
                    disabled={!name.trim()}
                    mt="md"
                >
                    Create Artist
                </Button>
            </Stack>
        </form>
    );
}
