/**
 * @file
 * Module: Creator Create Form
 * Description: A form component for adding new artists/creators to the system, handling API submission and success/error notifications.
 */
import { useState } from 'react';
import { TextInput, Select, Textarea, Button, Stack, Group, ActionIcon, Text, Box } from '@mantine/core';
import { useCreateCreatorApiCreatorsPost } from '../../api/generated/creators/creators';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconAlertCircle, IconTrash } from '@tabler/icons-react';
import type { CreatorType } from '../../api/model';
import { CREATOR_TYPES } from '../../types/enums';

interface CreatorCreateFormProps {
    onSuccess: () => void;
}

const PLATFORM_OPTIONS = [
    { value: 'Twitter', label: 'Twitter/X' },
    { value: 'Pixiv', label: 'Pixiv' },
    { value: 'Patreon', label: 'Patreon' },
    { value: 'Fantia', label: 'Fantia' },
    { value: 'Bilibili', label: 'Bilibili' },
    { value: 'YouTube', label: 'YouTube' },
    { value: 'Custom', label: 'Custom/Website' }
];

export function CreatorCreateForm({ onSuccess }: CreatorCreateFormProps) {
    const [name, setName] = useState('');
    const [type, setType] = useState<string | null>('Artist');
    const [notes, setNotes] = useState('');
    const [socials, setSocials] = useState<{ platform: string; url: string }[]>([]);
    const [newPlatform, setNewPlatform] = useState<string | null>('Twitter');
    const [newUrl, setNewUrl] = useState('');
    const [loading, setLoading] = useState(false);

    const createMutation = useCreateCreatorApiCreatorsPost();

    const handleAddSocial = () => {
        if (!newUrl.trim()) return;
        let formattedUrl = newUrl.trim();
        if (!/^https?:\/\//i.test(formattedUrl)) {
            formattedUrl = 'https://' + formattedUrl;
        }
        setSocials([...socials, { platform: newPlatform || 'Custom', url: formattedUrl }]);
        setNewUrl('');
    };

    const handleRemoveSocial = (index: number) => {
        setSocials(socials.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            await createMutation.mutateAsync({
                data: {
                    canonical_name: name.trim(),
                    type: (type as CreatorType) || 'Artist',
                    notes: notes.trim() || undefined,
                    socials: socials.length > 0 ? socials : undefined
                }
            });

            notifications.show({
                title: 'Success',
                message: `Artist "${name}" created successfully.`,
                color: 'green',
                icon: <IconCheck size={16} />
            });
            onSuccess();
        } catch (error: unknown) {
            let errorMsg = 'Failed to create artist.';
            if (error && typeof error === 'object' && 'response' in error) {
                const axiosError = error as { response?: { data?: { detail?: string | { message?: string } } } };
                const detail = axiosError.response?.data?.detail;
                if (detail) {
                    if (typeof detail === 'string') {
                        errorMsg = detail;
                    } else if (typeof detail === 'object' && 'message' in detail) {
                        errorMsg = detail.message || errorMsg;
                    }
                }
            }

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
                    data={CREATOR_TYPES}
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

                <Box>
                    <Text size="sm" fw={500} mb="xs">Social Profiles</Text>
                    <Stack gap="xs" mb={socials.length > 0 ? "xs" : 0}>
                        {socials.map((soc, idx) => (
                            <Group key={idx} justify="space-between" wrap="nowrap" style={{ padding: '6px 12px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: '4px' }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <Text size="xs" fw={700} c="dimmed">{soc.platform}</Text>
                                    <Text size="sm" truncate style={{ color: 'var(--mantine-color-blue-text)' }}>{soc.url}</Text>
                                </div>
                                <ActionIcon color="red" variant="subtle" onClick={() => handleRemoveSocial(idx)}>
                                    <IconTrash size={16} />
                                </ActionIcon>
                            </Group>
                        ))}
                    </Stack>
                    
                    <Group gap="xs" align="flex-end">
                        <Select
                            style={{ flex: 1 }}
                            placeholder="Platform"
                            data={PLATFORM_OPTIONS}
                            value={newPlatform}
                            onChange={setNewPlatform}
                        />
                        <TextInput
                            style={{ flex: 2 }}
                            placeholder="Profile URL"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.currentTarget.value)}
                        />
                        <Button 
                            onClick={handleAddSocial} 
                            disabled={!newUrl.trim()}
                            variant="light"
                        >
                            Add
                        </Button>
                    </Group>
                </Box>

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
