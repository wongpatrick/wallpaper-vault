import { Outlet } from "react-router-dom"
import SideNav from "./SideNav"
import classes from './Layout.module.css';

export default function MainLayout() {
    return (
        <div className={classes.layoutContainer}>
            <aside className={classes.sidebar}>
                <h2 className={classes.appTitle}>Wallpaper Vault</h2>
                <SideNav />
            </aside>
            
            <main className={classes.mainContent}>
                <Outlet />
            </main>
        </div>
    )
}
