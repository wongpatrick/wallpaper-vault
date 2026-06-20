/**
 * @file
 * TitleBarControls component.
 * Custom minimize, maximize/restore, and close buttons for frameless Electron window.
 */
import { useState, useEffect } from 'react';
import { IconMinus, IconSquare, IconCopy, IconX } from '@tabler/icons-react';
import classes from './Layout.module.css';

export default function TitleBarControls() {
    const [isMaximized, setIsMaximized] = useState(false);
    const isElectron = typeof window !== 'undefined' && 'electron' in window;
    const isWindows = isElectron && window.electron?.platform === 'win32';

    useEffect(() => {
        if (!isElectron || !window.electron) return;

        // Initialize state
        window.electron.isMaximized().then(setIsMaximized);

        // Listen for changes from main process and store the unsubscribe function
        const unsubscribe = window.electron.on('window-maximized-change', (maximized: unknown) => {
            setIsMaximized(!!maximized);
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [isElectron]);

    if (!isWindows) {
        return null;
    }

    const handleMinimize = () => {
        window.electron?.minimize();
    };

    const handleMaximize = () => {
        window.electron?.maximize();
    };

    const handleClose = () => {
        window.electron?.close();
    };

    return (
        <div className={classes.titleBarControls}>
            <button 
                type="button" 
                className={classes.windowButton} 
                onClick={handleMinimize}
                title="Minimize"
            >
                <IconMinus size={16} stroke={1.5} />
            </button>
            <button 
                type="button" 
                className={classes.windowButton} 
                onClick={handleMaximize}
                title={isMaximized ? "Restore" : "Maximize"}
            >
                {isMaximized ? (
                    <IconCopy size={14} stroke={1.5} />
                ) : (
                    <IconSquare size={14} stroke={1.5} />
                )}
            </button>
            <button 
                type="button" 
                className={`${classes.windowButton} ${classes.closeButton}`} 
                onClick={handleClose}
                title="Close"
            >
                <IconX size={16} stroke={1.5} />
            </button>
        </div>
    );
}
