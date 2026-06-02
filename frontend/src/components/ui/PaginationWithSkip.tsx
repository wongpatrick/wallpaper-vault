/**
 * @file
 * Module: PaginationWithSkip
 * Description: A reusable pagination component that adds a text input to skip to a specific page.
 */
import { Group, Pagination, TextInput, Text } from '@mantine/core';
import type { PaginationProps } from '@mantine/core';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { IconArrowRight } from '@tabler/icons-react';

interface PaginationWithSkipProps extends PaginationProps {
    total: number;
    value: number;
    onChange: (page: number) => void;
}

const ICON_OPACITY_DISABLED = 0.3;

export function PaginationWithSkip(props: PaginationWithSkipProps) {
    const { total, value, onChange, ...rest } = props;
    const [skipValue, setSkipValue] = useState('');

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && skipValue.trim() !== '') {
            let targetPage = parseInt(skipValue, 10);
            
            if (isNaN(targetPage)) return;
            
            // Clamp value
            if (targetPage < 1) targetPage = 1;
            if (targetPage > total) targetPage = total;
            
            onChange(targetPage);
            setSkipValue(''); // Clear after jump
        }
    };

    return (
        <Group gap="md" align="center">
            <Pagination total={total} value={value} onChange={onChange} {...rest} />
            <Group gap="xs" align="center">
                <Text size="sm" c="dimmed">Go to:</Text>
                <TextInput
                    size="sm"
                    placeholder="Page"
                    value={skipValue}
                    onChange={(e) => setSkipValue(e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                    style={{ width: 80 }}
                    rightSection={<IconArrowRight size={14} style={{ opacity: skipValue ? 1 : ICON_OPACITY_DISABLED }} />}
                />
            </Group>
        </Group>
    );
}
