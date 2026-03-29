import { useLocation, useNavigate } from 'react-router-dom';
import { NavLink, ActionIcon, Group, useMantineColorScheme, Stack, Divider, Box } from '@mantine/core';
import { IconBrush, IconDashboard, IconPhoto, IconSettings, IconTool, IconSun, IconMoon } from '@tabler/icons-react';

const mainLinks = [
    {
        icon: IconDashboard,
        label: 'Dashboard',
        path: '/'
    },
    {
        icon: IconBrush,
        label: 'Creators',
        path: '/creators'
    },
    {
        icon: IconPhoto,
        label: 'Sets',
        path: '/sets'
    },
    {
        icon: IconTool,
        label: 'Tools',
        path: '/tools'
    },
];

export default function SideNav() {
    const location = useLocation();
    const navigate = useNavigate();
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const dark = colorScheme === 'dark';
    
    return (
        <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            <Stack gap="xs" style={{ flex: 1 }}>
                {mainLinks.map((link) => (
                    <NavLink
                        key={link.label}
                        label={link.label}
                        leftSection={<link.icon size="1.2rem" stroke={1.5} />}
                        active={location.pathname === link.path}
                        onClick={() => navigate(link.path)}
                        variant="light"
                        color="blue"
                        styles={{
                            root: {
                                borderRadius: '8px',
                            }
                        }}
                    />
                ))}
            </Stack>

            <Stack gap="xs" mt="xl">
                <Divider mb="sm" />
                
                <NavLink
                    label="Settings"
                    leftSection={<IconSettings size="1.2rem" stroke={1.5} />}
                    active={location.pathname === '/settings'}
                    onClick={() => navigate('/settings')}
                    variant="light"
                    color="gray"
                    styles={{
                        root: {
                            borderRadius: '8px',
                        }
                    }}
                />

                <Group justify="center" p="xs">
                    <ActionIcon
                        variant="default"
                        onClick={() => toggleColorScheme()}
                        size="lg"
                        aria-label="Toggle color scheme"
                    >
                        {dark ? <IconSun size="1.2rem" /> : <IconMoon size="1.2rem" />}
                    </ActionIcon>
                </Group>
            </Stack>
        </Box>
    )
}
