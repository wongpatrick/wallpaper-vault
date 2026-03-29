import { ActionIcon, Group, useMantineColorScheme, Stack, Divider, Box } from '@mantine/core';
import { IconBrush, IconDashboard, IconPhoto, IconSettings, IconTool, IconSun, IconMoon } from '@tabler/icons-react';
import NavItem from './NavItem';

const mainLinks = [
    { icon: IconDashboard, label: 'Dashboard', path: '/' },
    { icon: IconBrush, label: 'Creators', path: '/creators' },
    { icon: IconPhoto, label: 'Sets', path: '/sets' },
    { icon: IconTool, label: 'Tools', path: '/tools' },
];

interface SideNavProps {
    collapsed: boolean;
}

export default function SideNav({ collapsed }: SideNavProps) {
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const dark = colorScheme === 'dark';

    return (
        <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Stack gap="xs" style={{ flex: 1 }}>
                {mainLinks.map((link) => (
                    <NavItem
                        key={link.label}
                        icon={link.icon}
                        label={link.label}
                        path={link.path}
                        collapsed={collapsed}
                    />
                ))}
            </Stack>

            <Stack gap="sm" mt="xl">
                <Divider />
                
                <NavItem
                    icon={IconSettings}
                    label="Settings"
                    path="/settings"
                    collapsed={collapsed}
                    color="gray"
                />

                <Group justify="center" py="xs">
                    <ActionIcon
                        variant="subtle"
                        onClick={() => toggleColorScheme()}
                        size="xl"
                        radius="md"
                        aria-label="Toggle color scheme"
                    >
                        {dark ? <IconSun size="1.4rem" stroke={1.5} /> : <IconMoon size="1.4rem" stroke={1.5} />}
                    </ActionIcon>
                </Group>
            </Stack>
        </Box>
    );
}
