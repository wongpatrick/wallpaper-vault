/**
 * @file
 * Module: Bulk Operation Mode Selector
 * Description: SegmentedControl and warning alert for choosing Append, Replace, or Remove in bulk operations.
 */
import { Stack, SegmentedControl, Text, Alert } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { BulkOperationMode } from '../../types/enums';

const ICON_SIZE = 16;

export interface BulkOperationModeSelectorProps {
    value: BulkOperationMode | string;
    onChange: (mode: BulkOperationMode) => void;
    targetDescription: string;
    count: number;
    label?: string;
}

export function BulkOperationModeSelector({
    value,
    onChange,
    targetDescription,
    count,
    label = 'Operation Mode'
}: BulkOperationModeSelectorProps) {
    const isReplace = value === BulkOperationMode.REPLACE || value === 'replace';

    return (
        <Stack gap={8}>
            <Text size="xs" fw={500} c="dimmed">{label}</Text>
            <SegmentedControl
                fullWidth
                value={value}
                onChange={(v) => onChange(v as BulkOperationMode)}
                data={[
                    { label: 'Append', value: BulkOperationMode.APPEND },
                    { label: 'Replace', value: BulkOperationMode.REPLACE },
                    { label: 'Remove', value: BulkOperationMode.REMOVE },
                ]}
            />
            {isReplace && (
                <Alert
                    icon={<IconAlertTriangle size={ICON_SIZE} />}
                    title="Warning: Replace Mode"
                    color="orange"
                    variant="light"
                    radius="md"
                >
                    Replace mode will overwrite and replace <strong>all existing {targetDescription}</strong> on all {count} selected items.
                </Alert>
            )}
        </Stack>
    );
}
