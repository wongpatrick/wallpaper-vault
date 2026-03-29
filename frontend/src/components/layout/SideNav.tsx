import { useLocation, useNavigate } from 'react-router-dom';
import { NavLink } from '@mantine/core';
import { IconBrush, IconDashboard, IconPhoto, IconSettings, IconTool } from '@tabler/icons-react';

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
    {
        icon: IconSettings,
        label: 'Settings',
        path: '/settings'
    }
];

export default function SideNav() {
    const location = useLocation();
    const navigate = useNavigate();
    
    return (
        <>
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
                            marginBottom: '4px'
                        }
                    }}
                />
            ))}
        </>
    )
}
