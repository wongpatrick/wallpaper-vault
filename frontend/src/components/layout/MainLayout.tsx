import { useState, useCallback, useEffect } from "react"
import { Outlet } from "react-router-dom"
import { useLocalStorage } from '@mantine/hooks';
import SideNav from "./SideNav"
import classes from './Layout.module.css';

export default function MainLayout() {
    const [sidebarWidth, setSidebarWidth] = useLocalStorage({
        key: 'sidebar-width',
        defaultValue: 280,
    });
    
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isResizing) {
                const newWidth = mouseMoveEvent.clientX;
                if (newWidth > 150 && newWidth < 600) {
                    setSidebarWidth(newWidth);
                }
            }
        },
        [isResizing, setSidebarWidth]
    );

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    return (
        <div className={classes.layoutContainer}>
            <aside 
                className={classes.sidebar} 
                style={{ width: sidebarWidth }}
            >
                <h2 className={classes.appTitle}>Wallpaper Vault</h2>
                <SideNav />
            </aside>
            
            <div 
                className={`${classes.resizer} ${isResizing ? classes.resizerActive : ''}`} 
                onMouseDown={startResizing}
            />
            
            <main className={classes.mainContent}>
                <Outlet />
            </main>
        </div>
    )
}
