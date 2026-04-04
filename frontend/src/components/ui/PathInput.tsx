import { TextInput, ActionIcon, type TextInputProps } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';

interface PathInputProps extends Omit<TextInputProps, 'onChange' | 'value'> {
    value?: string;
    onChange?: (value: string) => void;
}

export function PathInput({ value, onChange, ...props }: PathInputProps) {
    const handlePickDirectory = async () => {
        const path = await window.electron.openDirectory();
        if (path && onChange) {
            onChange(path);
        }
    };

    return (
        <TextInput
            {...props}
            value={value}
            onChange={(e) => onChange?.(e.currentTarget.value)}
            rightSection={
                <ActionIcon variant="subtle" color="gray" onClick={handlePickDirectory}>
                    <IconFolder size={18} />
                </ActionIcon>
            }
        />
    );
}
