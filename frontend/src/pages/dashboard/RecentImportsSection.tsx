/**
 * @file
 * Module: Recent Imports Section
 * Description: Lists recently added wallpaper sets with cover previews and vault indicators.
 */
import { Stack, Title, Center, Loader, Text, Paper, Group, Image, Box, Badge } from '@mantine/core';
import { useNavigate, useLocation } from 'react-router-dom';
import { getThumbnailUrl } from '../../utils/fileUtils';
import type { WithMultiVault } from '../../types/vault';
import type { SetSummary } from '../../api/model';
import type { MultiVaultPage } from '../../hooks/useMultiVaultQuery';

interface RecentImportsSectionProps {
    sets?: MultiVaultPage<SetSummary>;
    loading: boolean;
    isAggregated: boolean;
    onSwitchVault: (vaultId: string) => Promise<void>;
}

export function RecentImportsSection({
    sets,
    loading,
    isAggregated,
    onSwitchVault
}: RecentImportsSectionProps) {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <Stack gap="xs" mt="md">
            <Title order={3} size="h4">Recent Imports</Title>
            {loading ? (
                <Center py="xl"><Loader variant="dots" /></Center>
            ) : sets?.items?.length === 0 ? (
                <Text size="sm" c="dimmed">No sets imported yet.</Text>
            ) : (
                sets?.items?.map((set) => {
                    const multiSet = set as WithMultiVault<SetSummary>;
                    const coverUrl = set.preview_image_id 
                        ? getThumbnailUrl(set.preview_image_id, 'sm', undefined, multiSet._vaultUrl, multiSet._vaultApiKey)
                        : null;
                    return (
                        <Paper 
                            key={`${multiSet._vaultId || 'local'}-${set.id}`} 
                            withBorder 
                            p="xs" 
                            radius="md" 
                            onClick={async (e) => {
                                e.preventDefault();
                                if (isAggregated && multiSet._vaultId) {
                                    await onSwitchVault(multiSet._vaultId);
                                }
                                navigate(`/sets/${set.id}`, { state: { from: location.pathname, fromLabel: 'Dashboard' } });
                            }}
                            style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                        >
                            <Group justify="space-between" wrap="nowrap">
                                <Group wrap="nowrap">
                                    <Image 
                                        src={coverUrl} 
                                        w={40} 
                                        h={40} 
                                        radius="sm" 
                                        fallbackSrc="https://placehold.co/40x40?text=Set"
                                    />
                                    <Box>
                                        <Group gap={6} wrap="nowrap">
                                            <Text size="sm" fw={600} truncate="end" maw={220}>{set.title}</Text>
                                            {isAggregated && multiSet._vaultLabel && (
                                                <Badge size="xs" variant="dot" color="teal">
                                                    {multiSet._vaultLabel}
                                                </Badge>
                                            )}
                                        </Group>
                                        <Text size="xs" c="dimmed">{set.creators?.[0]?.canonical_name || 'Unknown'}</Text>
                                    </Box>
                                </Group>
                                <Badge variant="light" size="xs">{set.image_count ?? 0} images</Badge>
                            </Group>
                        </Paper>
                    );
                })
            )}
        </Stack>
    );
}
