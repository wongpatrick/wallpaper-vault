/**
 * @file
 * Module: CreatorCard Component
 * Description: Displays a single creator with their avatar and name in a card layout.
 */
import { memo } from 'react';
import { Card, Text, Stack, Badge } from '@mantine/core';
import type { Creator } from '../../api/model';
import type { WithMultiVault } from '../../types/vault';
import { CreatorAvatar } from './CreatorAvatar';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVault } from '../../hooks/useVault';
import { getLabelFromPath } from '../../utils/navigationUtils';

interface CreatorCardProps {
    creator: WithMultiVault<Creator>;
}

export const CreatorCard = memo(function CreatorCard({ creator }: CreatorCardProps) {
    const { isAggregated, switchVault } = useVault();
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <Card 
            shadow="sm" 
            padding="lg" 
            radius="md" 
            withBorder 
            onClick={async () => {
                if (isAggregated && creator._vaultId) {
                    await switchVault(creator._vaultId);
                }
                navigate(`/creators/${creator.id}`, {
                    state: {
                        from: location.pathname,
                        fromLabel: getLabelFromPath(location.pathname)
                    }
                });
            }}
            style={{ 
                cursor: 'pointer',
                transition: 'transform 200ms ease, box-shadow 200ms ease',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--mantine-shadow-md)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'var(--mantine-shadow-sm)';
            }}
        >
            <Stack align="center" gap="md">
                <CreatorAvatar 
                    imageId={creator.stats?.preview_image_id} 
                    size={100} 
                    baseUrlOverride={creator._vaultUrl}
                    apiKeyOverride={creator._vaultApiKey}
                />
                <Text fw={500} size="lg" ta="center" style={{ lineHeight: 1.2 }}>
                    {creator.canonical_name}
                </Text>
                {isAggregated && creator._vaultLabel && (
                    <Badge variant="dot" color="teal" size="xs">
                        {creator._vaultLabel}
                    </Badge>
                )}
            </Stack>
        </Card>
    );
});

