import { Paper, Text } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';

interface DropzoneProps {
    onDrop: (e: React.DragEvent) => void;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function Dropzone({ onDrop, onFileSelect }: DropzoneProps) {
    return (
        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <Paper 
                withBorder p={60} radius="md" bg="var(--mantine-color-blue-light)"
                style={{ 
                    borderStyle: 'dashed', 
                    borderWidth: 2, 
                    borderColor: 'var(--mantine-color-blue-4)', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center' 
                }}
                onClick={() => document.getElementById('fileInput')?.click()}
            >
                <input type="file" id="fileInput" hidden accept="image/*" onChange={onFileSelect} />
                <IconUpload size={48} stroke={1.5} color="var(--mantine-color-blue-6)" />
                <Text fw={500} mt="md">Drop an image here</Text>
                <Text size="sm" c="dimmed">to start cropping</Text>
            </Paper>
        </div>
    );
}
