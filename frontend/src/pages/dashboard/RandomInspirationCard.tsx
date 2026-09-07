/**
 * @file
 * Module: Random Inspiration Card
 * Description: Displays a randomly selected wallpaper with aspect ratio and link to its set.
 */
import { Stack, Group, Title, Tooltip, ActionIcon, Card, Image, Text, Badge, Button, Paper, Center } from '@mantine/core';
import { IconRefresh, IconExternalLink } from '@tabler/icons-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getImageUrl } from '../../utils/fileUtils';
import { getARColor } from '../../utils/aspectRatio';
import type { WithMultiVault } from '../../types/vault';
import type { Image as ImageModel } from '../../api/model';

interface RandomInspirationCardProps {
    randomImage?: ImageModel;
    isFetching: boolean;
    isAggregated: boolean;
    onRefresh: () => void;
    onSwitchVault: (vaultId: string) => Promise<void>;
}

export function RandomInspirationCard({
    randomImage,
    isFetching,
    isAggregated,
    onRefresh,
    onSwitchVault
}: RandomInspirationCardProps) {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Title order={3} size="h4">Inspiration</Title>
                <Tooltip label="Shuffle inspiration">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={onRefresh}
                        loading={isFetching}
                    >
                        <IconRefresh size={16} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            {randomImage ? (
                <Card withBorder radius="md" p={0}>
                    <Card.Section>
                        <Image 
                            src={getImageUrl(
                                randomImage.id, 
                                randomImage.phash || randomImage.file_size || undefined, 
                                (randomImage as WithMultiVault<ImageModel>)._vaultUrl, 
                                (randomImage as WithMultiVault<ImageModel>)._vaultApiKey
                            )} 
                            fallbackSrc="https://placehold.co/600x400?text=No+Preview"
                            alt="Random inspiration"
                        />
                    </Card.Section>
                    <Stack p="md" gap="xs">
                        <Group justify="space-between">
                            <Text fw={600} truncate="end" maw={200}>{randomImage.filename}</Text>
                            <Group gap="xs">
                                {isAggregated && (randomImage as WithMultiVault<ImageModel>)._vaultLabel && (
                                    <Badge size="xs" variant="dot" color="teal">
                                        {(randomImage as WithMultiVault<ImageModel>)._vaultLabel}
                                    </Badge>
                                )}
                                <Badge color={getARColor(randomImage.aspect_ratio_label || '')}>
                                    {randomImage.aspect_ratio_label}
                                </Badge>
                            </Group>
                        </Group>
                        <Button 
                            onClick={async () => {
                                if (isAggregated && (randomImage as WithMultiVault<ImageModel>)._vaultId) {
                                    await onSwitchVault((randomImage as WithMultiVault<ImageModel>)._vaultId!);
                                }
                                navigate(`/sets/${randomImage.set_id}`, { state: { from: location.pathname, fromLabel: 'Dashboard' } });
                            }}
                            variant="light" 
                            fullWidth 
                            leftSection={<IconExternalLink size="1rem" />}
                        >
                            View Set
                        </Button>
                    </Stack>
                </Card>
            ) : (
                <Paper withBorder p="xl" radius="md">
                    <Center h={200}>
                        <Text c="dimmed">Add some wallpapers to see inspiration!</Text>
                    </Center>
                </Paper>
            )}
        </Stack>
    );
}
