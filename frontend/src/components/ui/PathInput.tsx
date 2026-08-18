/**
 * @file
 * Module: PathInput Component
 * Description: Provides a text input field with a folder icon button that opens a native directory picker dialog via Electron.
 */
import { TextInput, ActionIcon, type TextInputProps } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';

interface PathInputProps extends Omit<TextInputProps, 'onChange' | 'value'> {
    value?: string;
    onChange?: (value: string) => void;
}

export function PathInput({ value, onChange, ...props }: PathInputProps) {
    const isElectron = typeof window !== 'undefined' && 'electron' in window;

    const handlePickDirectory = async () => {
        if (!isElectron || !window.electron?.openDirectory) return;
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
                isElectron ? (
                    <ActionIcon variant="subtle" color="gray" onClick={handlePickDirectory}>
                        <IconFolder size={18} />
                    </ActionIcon>
                ) : null
            }
        />
    );
}
