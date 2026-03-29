import { useLocation, useNavigate } from 'react-router-dom';
import { NavLink } from '@mantine/core';
import { IconBrush, IconDashboard, IconPhoto, IconSettings, IconTool } from '@tabler/icons-react';

export default function SideNav() {
    const location = useLocation();
    const navigate = useNavigate();
    return (
        <>
            <NavLink 
                label="Dashboard"
                leftSection={<IconDashboard size="1.2rem" stroke={1.5} />}
                className="nav-link"
                active={location.pathname === '/'}
                onClick={() => navigate('/')}
                variant='light'
            />
            <NavLink 
                label="Creators"
                leftSection={<IconBrush size="1.2rem" stroke={1.5} />}
                className="nav-link"
                active={location.pathname === '/creators'}
                onClick={() => navigate('/creators')}
                variant='light'
            />
            <NavLink 
                label="Sets"
                leftSection={<IconPhoto size="1.2rem" stroke={1.5} />}
                className="nav-link"
                active={location.pathname === '/sets'}
                onClick={() => navigate('/sets')}
                variant='light'
            />
            <NavLink
                label="Tools"
                leftSection={<IconTool size="1.2rem" stroke={1.5} />}
                className="nav-link"
                active={location.pathname === '/tools'}
                onClick={() => navigate('/tools')}
                variant='light'
            />
            <NavLink
                label="Settings"
                leftSection={<IconSettings size="1.2rem" stroke={1.5} />}
                className="nav-link"
                active={location.pathname === '/settings'}
                onClick={() => navigate('/settings')}
                variant='light'
            />
        </>
    )
}