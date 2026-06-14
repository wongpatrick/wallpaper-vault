import { Card, Text, Stack } from '@mantine/core';
import type { Creator } from '../../api/model';
import { CreatorAvatar } from './CreatorAvatar';
import { useNavigate } from 'react-router-dom';

interface CreatorCardProps {
    creator: Creator;
}

export function CreatorCard({ creator }: CreatorCardProps) {
    const navigate = useNavigate();

    return (
        <Card 
            shadow="sm" 
            padding="lg" 
            radius="md" 
            withBorder 
            onClick={() => navigate(`/creators/${creator.id}`)}
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
                />
                <Text fw={500} size="lg" ta="center" style={{ lineHeight: 1.2 }}>
                    {creator.canonical_name}
                </Text>
            </Stack>
        </Card>
    );
}
