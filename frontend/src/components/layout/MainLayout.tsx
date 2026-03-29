import { Outlet } from "react-router-dom"
import { AppShell, Title } from "@mantine/core"
import SideNav from "./SideNav"
import classes from './Layout.module.css';

export default function MainLayout() {
    return (
        <AppShell
            navbar={{
                width: 280,
                breakpoint: 'sm',
            }}
            padding="md"
        >
            <AppShell.Navbar p="md" className={classes.navbar}>
                <Title 
                    order={3} 
                    className={classes.appTitle} 
                    mb="xl"
                    pl="xs"
                >
                    Wallpaper Vault
                </Title>
                
                <SideNav />
            </AppShell.Navbar>
            
            <AppShell.Main className={classes.main}>
                <Outlet />
            </AppShell.Main>
        </AppShell>
    )
}
