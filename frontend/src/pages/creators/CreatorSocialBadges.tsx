/**
 * @file
 * Module: Creator Social Badges
 * Description: Renders social profile badges with platform icons for creator pages.
 */
import { Group, Badge } from '@mantine/core';
import { 
    IconBrandX, 
    IconBrandYoutube, 
    IconBrandPatreon, 
    IconGlobe, 
    IconDeviceTv, 
    IconBrush 
} from '@tabler/icons-react';
import type { SocialLink } from '../../types/creator';

function getSocialIcon(platform: string) {
    switch (platform.toLowerCase()) {
        case 'twitter':
        case 'x':
            return <IconBrandX size={12} />;
        case 'youtube':
            return <IconBrandYoutube size={12} />;
        case 'patreon':
            return <IconBrandPatreon size={12} />;
        case 'bilibili':
            return <IconDeviceTv size={12} />;
        case 'pixiv':
        case 'fantia':
            return <IconBrush size={12} />;
        default:
            return <IconGlobe size={12} />;
    }
}

export function CreatorSocialBadges({ socials }: { socials?: SocialLink[] | null }) {
    if (!socials || socials.length === 0) return null;

    return (
        <Group gap="xs" mt="xs" wrap="wrap">
            {socials.map((soc, idx) => (
                <Badge 
                    key={idx} 
                    component="a" 
                    href={soc.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    variant="outline" 
                    color="gray"
                    leftSection={getSocialIcon(soc.platform)}
                    style={{ cursor: 'pointer', textTransform: 'none' }}
                >
                    {soc.platform}
                </Badge>
            ))}
        </Group>
    );
}
