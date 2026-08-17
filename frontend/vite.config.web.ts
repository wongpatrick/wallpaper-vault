/**
 * @file
 * Web-only Vite configuration for hosted demo deployments.
 * Excludes Electron plugins and builds a pure static React single-page application.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
  },
})
