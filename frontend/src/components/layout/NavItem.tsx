import { NavLink, Tooltip } from '@mantine/core';
import { useNavigate, useLocation } from 'react-router-dom';
import React from 'react';

interface NavItemProps {
    icon: React.ElementType;
    label: string;
    path: string;
    collapsed: boolean;
    color?: string;
}

export default function NavItem({ icon: Icon, label, path, collapsed, color = "blue" }: NavItemProps) {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <Tooltip
            label={label}
            position="right"
            disabled={!collapsed}
            withArrow
            transitionProps={{ transition: 'fade', duration: 200 }}
        >
            <NavLink
                label={collapsed ? null : label}
                leftSection={<Icon size="1.4rem" stroke={1.5} />}
                active={location.pathname === path}
                onClick={() => navigate(path)}
                variant="light"
                color={color}
                styles={{
                    root: {
                        borderRadius: '12px',
                        height: '44px',
                        display: 'flex',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        padding: collapsed ? 0 : '0 16px',
                        transition: 'all 0.2s ease',
                    },
                    section: {
                        margin: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: collapsed ? '100%' : 'auto'
                    }
                }}
            />
        </Tooltip>
    );
}
