import { Outlet } from "react-router-dom"
import SideNav from "./SideNav"

export default function MainLayout() {
    return (
        <div className="layout-container">
            <aside className="sidebar">
                <h2 className="app-title">Wallpaper Vault</h2>
                <SideNav />
            </aside>
            
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    )
}