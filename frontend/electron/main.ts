import { app, BrowserWindow, ipcMain, dialog } from 'electron';
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

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(__dirname, `../dist/index.html`))
    }
}

app.whenReady().then(createWindow)