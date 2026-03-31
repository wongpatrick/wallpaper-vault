import { Stack, Text, Paper } from '@mantine/core';

interface CroppedPreviewProps {
    croppedImage: string;
    width: number;
    height: number;
}

export function CroppedPreview({ croppedImage, width, height }: CroppedPreviewProps) {
    return (
        <Stack gap="xs" style={{ width: 320 }}>
            <Text fw={600} size="sm">Cropped Preview</Text>
            <Paper withBorder p="xs" radius="md" bg="var(--mantine-color-gray-0)">
                <img src={croppedImage} alt="Cropped" style={{ width: '100%', display: 'block', borderRadius: '4px' }} />
                <Text size="xs" c="dimmed" mt="xs" ta="center">
                    {Math.round(width)} x {Math.round(height)} px
                </Text>
            </Paper>
        </Stack>
    );
}
