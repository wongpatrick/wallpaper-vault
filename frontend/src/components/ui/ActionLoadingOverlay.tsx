/**
 * @file
 * Module: ActionLoadingOverlay Component
 * Description: Displays a premium, centered loading card overlay with backdrop blur
 * and customizable title/message, preventing interactions during asynchronous actions.
 */
import { Paper, Loader, Group, Stack, Text, Transition, Progress } from '@mantine/core';

interface ActionLoadingOverlayProps {
    visible: boolean;
    title?: string;
    message?: string;
    progress?: number;
    total?: number;
    bottomOffset?: number;
}

export function ActionLoadingOverlay({ visible, title, message, progress, total, bottomOffset = 0 }: ActionLoadingOverlayProps) {
    const showProgress = total !== undefined && total > 0;
    const progressPercent = showProgress ? Math.round(((progress || 0) / total) * 100) : 0;

    return (
        <Transition mounted={visible} transition="slide-up" duration={300}>
            {(styles) => (
                <Paper
                    withBorder
                    shadow="xl"
                    p="md"
                    radius="md"
                    style={{
                        ...styles,
                        position: 'fixed',
                        bottom: 24 + bottomOffset,
                        right: 24,
                        zIndex: 1000,
                        maxWidth: 360,
                        width: 'calc(100% - 48px)',
                        background: 'light-dark(rgba(255, 255, 255, 0.95), rgba(26, 27, 30, 0.95))',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1))',
                    }}
                >
                    <Group align="flex-start" gap="md" wrap="nowrap">
                        <Loader size="sm" color="blue" mt={2} />
                        <Stack gap={2} style={{ flex: 1 }}>
                            {title && (
                                <Text size="sm" fw={600} style={{ margin: 0, lineHeight: 1.2 }}>
                                    {title}
                                </Text>
                            )}
                            {message && (
                                <Text size="xs" c="dimmed" style={{ lineHeight: 1.3 }}>
                                    {message}
                                </Text>
                            )}
                            {showProgress && (
                                <Stack gap={4} mt={6} style={{ width: '100%' }}>
                                    <Progress 
                                        value={progressPercent} 
                                        size="xs" 
                                        radius="xl" 
                                        animated={progressPercent < 100} 
                                        color="blue" 
                                    />
                                    <Text size="10px" c="dimmed" ta="right">
                                        Processed {progress} / {total} images ({progressPercent}%)
                                    </Text>
                                </Stack>
                            )}
                        </Stack>
                    </Group>
                </Paper>
            )}
        </Transition>
    );
}
