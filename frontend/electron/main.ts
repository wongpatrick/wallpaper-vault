import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow() {
    const win = new BrowserWindow({
        width: 1600,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false
        },
    })
    
    // Add directory picker handler
    ipcMain.handle('open-directory', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ['openDirectory']
        })
        if (canceled) {
            return null
        } else {
            return filePaths[0]
        }
    })

    ipcMain.handle('open-path', async (_event, filePath: string) => {
        if (!filePath) return { success: false, error: 'No path provided' };
        
        // Normalize slashes for the OS
        const normalizedPath = path.normalize(filePath);
        console.log('Opening path:', normalizedPath);
        
        const error = await shell.openPath(normalizedPath);
        if (error) {
            console.error('Failed to open path:', error);
            return { success: false, error };
        }
        return { success: true };
    })

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(__dirname, `../dist/index.html`))
    }
}

app.whenReady().then(createWindow)