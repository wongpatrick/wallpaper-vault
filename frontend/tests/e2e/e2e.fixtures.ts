/**
 * @file
 * Playwright E2E testing fixtures.
 * Manages test directory creation, backend uvicorn process, database setup,
 * and Electron app execution lifecycle for the integration test runner.
 */
import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_CLEANUP_RETRIES = 5;
const MAX_CLEANUP_RETRY_INDEX = 4;
const CLEANUP_RETRY_DELAY_MS = 500;
const BACKEND_STARTUP_TIMEOUT_MS = 20000;
const HTTP_STATUS_OK = 200;
const BACKEND_CHECK_INTERVAL_MS = 500;

type E2EFixtures = {
  electronApp: ElectronApplication;
  window: Page;
  testDir: string;
};

export const test = base.extend<E2EFixtures>({
  // Manages the test directory and dummy images
  // eslint-disable-next-line no-empty-pattern
  testDir: async ({}, runner) => {
    const tempDir = path.join(__dirname, 'temp_import_dir');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    // Create 2 dummy PNG images using base64
    const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const buffer = Buffer.from(base64Png, 'base64');
    fs.writeFileSync(path.join(tempDir, 'image1.png'), buffer);
    fs.writeFileSync(path.join(tempDir, 'image2.png'), buffer);

    await runner(tempDir);

    // Cleanup temp files/directories after tests
    for (let i = 0; i < MAX_CLEANUP_RETRIES; i++) {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        break;
      } catch (e) {
        if (i === MAX_CLEANUP_RETRY_INDEX) {
          console.error('Failed to cleanup tempDir', e);
        } else {
          await new Promise(resolve => setTimeout(resolve, CLEANUP_RETRY_DELAY_MS));
        }
      }
    }
  },

  // Manages the backend uvicorn process and electron app launch
  electronApp: async ({ testDir }, runner) => {
    const rootDir = path.resolve(__dirname, '../../..');
    const backendDir = path.join(rootDir, 'backend');
    
    // 1. Reset and initialize test database schema
    console.log('Initializing test database...');
    const initDbResult = spawnSync('uv', ['run', 'python', '../db/init_test_db.py'], {
      cwd: backendDir,
      shell: true,
      encoding: 'utf-8',
      env: {
        ...process.env,
        DATABASE_URL: 'sqlite+aiosqlite:///../db/test_e2e.db',
      },
    });
    if (initDbResult.status !== 0) {
      throw new Error(`Failed to initialize database: ${initDbResult.stderr || initDbResult.stdout}`);
    }
    console.log('Database initialized successfully.');

    // Ensure port 8001 is completely free
    if (process.platform === 'win32') {
      try {
        const netstat = spawnSync('cmd.exe', ['/c', 'netstat -ano | findstr :8001'], { encoding: 'utf-8' });
        if (netstat.stdout) {
          const lines = netstat.stdout.split('\n');
          for (const line of lines) {
            if (!line.includes('LISTENING')) {
              continue;
            }
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(Number(pid)) && Number(pid) > 0 && Number(pid) !== process.pid) {
              console.log(`Port 8001 is in use by PID ${pid} (LISTENING). Killing it...`);
              spawnSync('taskkill', ['/f', '/pid', pid]);
            }
          }
        }
      } catch (e) {
        console.error('Failed to clean up port 8001', e);
      }
    }

    // 2. Spawn the backend process on port 8001 pointing to test_e2e.db
    const backendEnv = {
      ...process.env,
      DATABASE_URL: 'sqlite+aiosqlite:///../db/test_e2e.db',
    };
    console.log('Spawning FastAPI backend on port 8001...');
    const backendProcess = spawn('uv', ['run', 'uvicorn', 'app.main:app', '--port', '8001'], {
      cwd: backendDir,
      shell: true,
      env: backendEnv,
    });

    backendProcess.stdout?.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`);
    });
    backendProcess.stderr?.on('data', (data) => {
      console.error(`[Backend Error] ${data.toString().trim()}`);
    });

    // 3. Wait for backend to be healthy
    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (Date.now() - start > BACKEND_STARTUP_TIMEOUT_MS) {
          clearInterval(interval);
          backendProcess.kill();
          reject(new Error('Timeout waiting for backend to start'));
          return;
        }
        
        http.get('http://localhost:8001/', (res) => {
          if (res.statusCode === HTTP_STATUS_OK) {
            clearInterval(interval);
            resolve();
          }
        }).on('error', () => {
          // Retry
        });
      }, BACKEND_CHECK_INTERVAL_MS);
    });
    console.log('Backend is up and running.');

    // 4. Launch Electron App pointing to Vite dev server port 5174
    const mainJsPath = path.join(rootDir, 'frontend/dist-electron/main.js');
    const userDataPath = path.join(testDir, 'user-data');
    console.log('Launching Electron with user data dir:', userDataPath);
    const electronApp = await electron.launch({
      args: [mainJsPath, `--user-data-dir=${userDataPath}`],
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: 'http://localhost:5174',
        NODE_ENV: 'test',
        DATABASE_URL: 'sqlite+aiosqlite:///../db/test_e2e.db',
      },
    });

    // 5. Evaluate to mock dialog.showOpenDialog and webUtils.getPathForFile in Electron main process
    await electronApp.evaluate(({ dialog, webUtils }, mockDir) => {
      dialog.showOpenDialog = () => {
        return Promise.resolve({
          canceled: false,
          filePaths: [mockDir],
        });
      };
      if (webUtils) {
        Object.defineProperty(webUtils, 'getPathForFile', {
          value: () => mockDir,
          configurable: true,
          writable: true,
        });
      }
    }, testDir);

    // Yield control to the test
    await runner(electronApp);

    // 6. Tear down Electron and Backend
    console.log('Closing Electron app...');
    await electronApp.close();
    
    console.log('Terminating backend process...');
    backendProcess.kill();
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t']);
    }
  },

  window: async ({ electronApp }, runner) => {
    const page = await electronApp.firstWindow();
    page.on('console', msg => {
      console.log(`[Renderer Console] ${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', err => {
      console.error(`[Renderer PageError] ${err.stack || err.message}`);
    });
    await page.waitForLoadState('domcontentloaded');
    await runner(page);
  },
});

export { expect } from '@playwright/test';
