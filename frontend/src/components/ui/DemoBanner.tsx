/**
 * @file
 * DemoBanner Component
 * Renders a persistent header banner indicating that the application is running in read-only demo mode.
 */
import { useState } from 'react';
import { Box, Group, Text, Anchor, ActionIcon, rem } from '@mantine/core';
import { IconInfoCircle, IconBrandGithub, IconX } from '@tabler/icons-react';
import { IS_DEMO_MODE } from '../../config';

const BANNER_FONT_SIZE_PX = 13;
const GITHUB_ICON_SIZE = 15;
const INFO_ICON_SIZE = 16;
const CLOSE_ICON_SIZE = 14;
const BANNER_HEIGHT_PX = 32;

interface DemoBannerProps {
    onDismiss?: () => void;
}

export function DemoBanner({ onDismiss }: DemoBannerProps = {}) {
    const [dismissed, setDismissed] = useState(false);

    if (!IS_DEMO_MODE || dismissed) {
        return null;
    }

    const handleDismiss = () => {
        setDismissed(true);
        onDismiss?.();
    };

    return (
        <Box
            style={{
                backgroundColor: 'var(--mantine-color-blue-9)',
                color: 'var(--mantine-color-blue-0)',
                borderBottom: '1px solid var(--mantine-color-blue-8)',
                padding: '0 16px',
                height: rem(BANNER_HEIGHT_PX),
                fontSize: rem(BANNER_FONT_SIZE_PX),
                fontWeight: 500,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
            }}
        >
            <Group justify="space-between" align="center" gap="sm" style={{ width: '100%' }}>
                <Group gap="xs" align="center">
                    <IconInfoCircle size={INFO_ICON_SIZE} />
                    <Text size="sm" inherit>
                        You are viewing a <strong>read-only demo</strong> of Wallpaper Vault. State-modifying actions and OS wallpaper changes are disabled.
                    </Text>
                </Group>

                <Group gap="md" align="center">
                    <Anchor
                        href="https://github.com/wongpatrick/wallpaper-vault"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            color: 'var(--mantine-color-white)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            textDecoration: 'underline',
                            fontSize: rem(BANNER_FONT_SIZE_PX),
                        }}
                    >
                        <IconBrandGithub size={GITHUB_ICON_SIZE} />
                        Download Desktop App
                    </Anchor>

                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray.0"
                        onClick={handleDismiss}
                        aria-label="Dismiss banner"
                    >
                        <IconX size={CLOSE_ICON_SIZE} />
                    </ActionIcon>
                </Group>
            </Group>
        </Box>
    );
}

export default DemoBanner;
