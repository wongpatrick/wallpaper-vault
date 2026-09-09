/**
 * @file
 * Module: Creator Socials Form & Badges
 * Description: Interactive input form and display badges for managing creator social profile links.
 */
import { useState } from 'react';
import { Box, Stack, Group, Text, Select, TextInput, Button, ActionIcon } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { PLATFORM_OPTIONS, type SocialLink } from '../../types/creator';

interface CreatorSocialsFormProps {
    socials: SocialLink[];
    onChange: (socials: SocialLink[]) => void;
}

export function CreatorSocialsForm({ socials, onChange }: CreatorSocialsFormProps) {
    const [newPlatform, setNewPlatform] = useState<string | null>('Twitter');
    const [newUrl, setNewUrl] = useState('');

    const handleAdd = () => {
        if (!newUrl.trim()) return;
        let formattedUrl = newUrl.trim();
        if (!/^https?:\/\//i.test(formattedUrl)) {
            formattedUrl = 'https://' + formattedUrl;
        }
        onChange([...socials, { platform: newPlatform || 'Custom', url: formattedUrl }]);
        setNewUrl('');
    };

    const handleRemove = (index: number) => {
        onChange(socials.filter((_, idx) => idx !== index));
    };

    return (
        <Box>
            <Text size="sm" fw={500} mb="xs">Social Profiles</Text>
            <Stack gap="xs" mb={socials.length > 0 ? "xs" : 0}>
                {socials.map((soc, idx) => (
                    <Group 
                        key={idx} 
                        justify="space-between" 
                        wrap="nowrap" 
                        style={{ padding: '6px 12px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: '4px' }}
                    >
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <Text size="xs" fw={700} c="dimmed">{soc.platform}</Text>
                            <Text size="sm" truncate style={{ color: 'var(--mantine-color-blue-text)' }}>{soc.url}</Text>
                        </div>
                        <ActionIcon color="red" variant="subtle" onClick={() => handleRemove(idx)}>
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
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAdd();
                        }
                    }}
                />
                <Button 
                    onClick={handleAdd} 
                    disabled={!newUrl.trim()}
                    variant="light"
                >
                    Add
                </Button>
            </Group>
        </Box>
    );
}
