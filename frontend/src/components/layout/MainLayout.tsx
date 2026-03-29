import { Outlet } from "react-router-dom"
import { AppShell, Title, Box, Button, Group, ActionIcon, Tooltip } from "@mantine/core"
import SideNav from "./SideNav"
import classes from './Layout.module.css';
import { useSidebarResizer } from "../../hooks/useSidebarResizer";
import { IconPackage, IconPlus, IconBell } from "@tabler/icons-react";

export default function MainLayout() {
    const { width, isResizing, startResizing, isCollapsed } = useSidebarResizer();

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
                        <Tooltip label="Notifications">
                            <ActionIcon variant="subtle" color="gray" size="md" radius="md">
                                <IconBell size={18} stroke={1.5} />
                            </ActionIcon>
                        </Tooltip>

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
