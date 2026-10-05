/**
 * @file
 * Module: DashboardHealthAlerts Component
 * Description: Renders priority library health warnings and action links for resolving library discrepancies.
 */
import { Stack, Title, Alert, Group, Text, Button } from '@mantine/core';
import { IconAlertCircle, IconExclamationMark, IconInfoCircle, IconArrowRight } from '@tabler/icons-react';

export interface DashboardHealthAlert {
    id: string | number;
    severity: 'critical' | 'warning' | 'info' | string;
    message: string;
    count: number;
    link: string;
}

interface DashboardHealthAlertsProps {
    alerts: DashboardHealthAlert[];
    onResolve: (link: string) => void;
}

export function DashboardHealthAlerts({ alerts, onResolve }: DashboardHealthAlertsProps) {
    if (!alerts || alerts.length === 0) return null;

    return (
        <Stack gap="sm">
            <Title order={3} size="h4">Library Health</Title>
            {alerts.map((alert) => (
                <Alert 
                    key={alert.id}
                    variant="light" 
                    color={alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'orange' : 'blue'}
                    title={`${alert.message} (${alert.count})`}
                    icon={
                        alert.severity === 'critical' 
                            ? <IconAlertCircle size="1rem" /> 
                            : alert.severity === 'warning' 
                            ? <IconExclamationMark size="1rem" /> 
                            : <IconInfoCircle size="1rem" />
                    }
                    styles={{ title: { fontWeight: 600 } }}
                >
                    <Group justify="space-between" align="center">
                        <Text size="sm">These items might need your attention to maintain library integrity.</Text>
                        <Button 
                            variant="subtle" 
                            size="xs" 
                            rightSection={<IconArrowRight size="1rem" />}
                            onClick={() => onResolve(alert.link)}
                        >
                            Resolve
                        </Button>
                    </Group>
                </Alert>
            ))}
        </Stack>
    );
}
