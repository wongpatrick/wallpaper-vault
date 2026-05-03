import { Outlet } from "react-router-dom"
import { AppShell, Title, Box, Button, Group, ActionIcon, Tooltip, Popover, Indicator, Stack, Text, Divider, ScrollArea, ThemeIcon } from "@mantine/core"
import SideNav from "./SideNav"
import classes from './Layout.module.css';
import { useSidebarResizer } from "../../hooks/useSidebarResizer";
import { IconPackage, IconPlus, IconBell, IconCheck, IconX } from "@tabler/icons-react";
import { useNotificationHistory } from "../../context/NotificationContext";
import { useState } from "react";

export default function MainLayout() {
    const { width, isResizing, startResizing, isCollapsed } = useSidebarResizer();
    const { history, unreadCount, markAllAsRead, clearHistory } = useNotificationHistory();
    const [opened, setOpened] = useState(false);

    return (
        <AppShell
            layout="alt"
            header={{ height: 56 }}
            navbar={{
                width: { base: width },
                breakpoint: 'sm',
            }}
            padding="md"
        >
            <AppShell.Header px="md" className={classes.header}>
                <Group h="100%" justify="space-between">
                    <Group style={{ flex: 1, maxWidth: 500 }}>
                    </Group>

                    <Group gap="sm">
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
                                                            {item.status === 'completed' || item.status === 'success' ? <IconCheck size={12} /> : 
                                                            item.status === 'error' ? <IconX size={12} /> : 
                                                            <IconBell size={12} />}
                                                        </ThemeIcon>
                                                        <Stack gap={2} style={{ flex: 1 }}>
                                                            <Text size="xs" fw={600} lineClamp={1}>{item.title}</Text>
                                                            <Text size="xs" c="dimmed" lineClamp={2}>{item.message}</Text>
                                                            <Text size="xs" c="dimmed" mt={4}>
                                                                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

                        <Button 
                            leftSection={<IconPlus size={18} />} 
                            radius="md"
                            size="sm"
                            variant="filled"
                        >
                            Add Set
                        </Button>
                    </Group>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="md" className={`${classes.navbar} ${isResizing ? classes.navbarResizing : ''}`}>
                <Box 
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: isCollapsed ? 0 : '12px',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        marginBottom: 'var(--mantine-spacing-xl)',
                        height: 44,
                        transition: 'all 0.2s ease'
                    }}
                >
                    <IconPackage size={28} style={{ minWidth: 28 }} color="var(--mantine-color-blue-6)" />
                    <Title 
                        order={3} 
                        className={`${classes.appTitle} ${isCollapsed ? classes.appTitleCollapsed : ''}`} 
                    >
                        Wallpaper Vault
                    </Title>
                </Box>

                <SideNav collapsed={isCollapsed} />

                <div 
                    className={`${classes.resizer} ${isResizing ? classes.resizing : ''}`}
                    onMouseDown={startResizing}
                />
            </AppShell.Navbar>

            <AppShell.Main className={classes.main}>
                <Outlet />
            </AppShell.Main>
        </AppShell>
    )
}

