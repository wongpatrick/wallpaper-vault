/**
 * @file
 * Header notification center dropdown popover.
 * Displays application notification history with status badges and unread indicator.
 */
import { useState } from 'react';
import {
  Popover,
  Tooltip,
  Indicator,
  ActionIcon,
  Stack,
  Group,
  Text,
  Button,
  Divider,
  ScrollArea,
  Box,
  ThemeIcon,
} from '@mantine/core';
import { IconBell, IconCheck, IconX } from '@tabler/icons-react';
import { useNotificationHistory } from '../../hooks/useNotificationHistory';
import classes from './Layout.module.css';

/**
 * Dropdown popover displaying recent notifications with clear and mark-as-read actions.
 */
export function NotificationCenter() {
  const { history, unreadCount, markAllAsRead, clearHistory } = useNotificationHistory();
  const [opened, setOpened] = useState(false);

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md" width={320}>
      <Popover.Target>
        <Tooltip label="Notifications">
          <Indicator disabled={unreadCount === 0} label={unreadCount} size={16} offset={2} color="red">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              radius="md"
              onClick={() => {
                setOpened((o) => !o);
                if (!opened) markAllAsRead();
              }}
            >
              <IconBell size={18} stroke={1.5} />
            </ActionIcon>
          </Indicator>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <Stack gap={0}>
          <Group justify="space-between" p="xs">
            <Text size="sm" fw={600}>Notifications</Text>
            <Button variant="subtle" size="compact-xs" color="gray" onClick={clearHistory}>
              Clear all
            </Button>
          </Group>
          <Divider />
          <ScrollArea.Autosize mah={400} type="hover">
            {history.length === 0 ? (
              <Box py="xl">
                <Text size="xs" c="dimmed" ta="center">No recent notifications</Text>
              </Box>
            ) : (
              history.map((item) => (
                <Box key={item.id} p="xs" className={classes.notificationItem}>
                  <Group align="flex-start" wrap="nowrap" gap="sm">
                    <ThemeIcon
                      size="sm"
                      radius="xl"
                      color={item.color || 'blue'}
                      variant="light"
                    >
                      {item.status === 'completed' || item.status === 'success' ? (
                        <IconCheck size={12} />
                      ) : item.status === 'error' ? (
                        <IconX size={12} />
                      ) : (
                        <IconBell size={12} />
                      )}
                    </ThemeIcon>
                    <Stack gap={2} style={{ flex: 1 }}>
                      <Text size="xs" fw={600} lineClamp={1}>{item.title}</Text>
                      <Text size="xs" c="dimmed" lineClamp={2}>{item.message}</Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        {new Date(item.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </Stack>
                  </Group>
                </Box>
              ))
            )}
          </ScrollArea.Autosize>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
