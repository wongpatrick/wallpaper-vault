# Wallpaper Vault: Frontend Shell (Electron + React)

## 🚀 Overview
The "Wallpaper Vault" frontend is a desktop shell built with **Electron** and **React**. It provides a rich, native-like interface for managing wallpaper collections and interacting with the FastAPI engine.

## 🛠️ Technical Stack
- **Framework:** [React 19](https://react.dev/) (Vite)
- **Desktop Shell:** [Electron](https://www.electronjs.org/)
- **UI Toolkit:** [Mantine UI v7](https://mantine.dev/)
- **Icons:** [Tabler Icons](https://tabler.io/icons)
- **API Client:** [Axios](https://axios-http.com/) with [Orval](https://orval.dev/) for automatic hook generation.
- **State & Data:** [React Query v5](https://tanstack.com/query) for efficient caching and server state.
- **Communication:** **EventSource** for real-time task progress updates via SSE.

---

## 🏗️ Architecture
The frontend is organized for maximum modularity and reusability:

*   **`src/api/`**: Axios instance and generated React Query hooks.
*   **`src/pages/`**: Route-level page orchestrators (Dashboard, Sets, Creators, Playlists, Rotation, Tools, Settings).
*   **`src/context/`**: State providers (`VaultProvider` with platform strategy pattern, `TaskProvider`, `NotificationProvider`).
*   **`src/context/adapters/`**: Platform storage adapters (`ElectronVaultAdapter` for desktop IPC and `WebLocalStorageVaultAdapter` for browser localStorage).
*   **`src/components/`**: Modular UI components (Vault Switcher, Aggregated Banner, Lightbox, Crop Modal, Taxonomy).
*   **`src/utils/`**: Centralized utilities (e.g., `imageUrl.ts` for URL handling, `fileDrop.ts` for folder drag-and-drop, `formatBytes.ts` for size formatting).
*   **`electron/`**: Main process, preload scripts, and modular services (`services/` for rotation coordination, PowerShell daemon, monitor layout, and vault registry).

### 🏠 Main Views
*   **Dashboard:** Centralized landing page displaying real-time library statistics (including SQLite database size), recent imports, random inspiration auto-rotation, and dedicated split word clouds for set metadata vs image tags/characters/franchises.
*   **Library (Sets):** Visual grid with live search, type-based filtering, and multi-path storage assignment.
*   **Playlists:** Dedicated page for managing custom and smart playlists with drag-and-drop sorting, aspect ratio filters, and cross-vault image assembly.
*   **Artist Hub (Creators):** Portfolio views showcasing an artist's full collection with social links and merge capabilities.
*   **Taxonomy Hub:** Generic deduplicated CRUD management interface for Tags, Characters, and Franchises.
*   **Tools:** Specialized utilities for multi-phase batch importing and saliency-aware image cropping.
*   **Settings:** Complete configuration hub for multi-path storage roots, connected federated vaults, AI auto-tagging, cache management, and rotation settings.

---

## 🚦 Development

### Setup
Requires **Node.js 20+**.
```powershell
npm install
```

### Running the Shell (Desktop)
```powershell
npm run dev
```

### Running in Web SPA Mode (Browser Only)
```powershell
npm run dev:web
```

### API Integration
We use **Orval** to maintain type safety across the stack. The generated client and models (in `src/api/generated/` and `src/api/model/`) are ignored by Git.

They are automatically generated before running development, build, lint, or test scripts (via `predev`, `prebuild`, `prebuild-app`, `prelint`, `pretest`, and `pretest:watch` npm hooks).

If you make backend API changes and want to manually regenerate the TypeScript types and React Query hooks, run:
```powershell
npm run generate
```

---

## 🎨 Advanced Features
- **Multi-Vault Federation:** Fast context switcher in the top navigation bar, cross-vault playlist composition, and unified aggregated "All Vaults" catalog view.
- **Native OS & Multi-Monitor Rotation:** Windows COM daemon (`IDesktopWallpaper`) for instant, flicker-free desktop wallpaper updates across multi-monitor setups, with automatic local caching for remote vault images.
- **Native OS File Integration:** Open any set's folder directly in Windows Explorer via Electron's `shell` module.
- **Playlists & DisplayFusion:** Custom playlist manager with drag-and-drop sort order, coupled with aspect ratio filtering and DisplayFusion rotation endpoint support.
- **Precision Cropper:** A dedicated UI for creating perfect aspect-ratio crops for wallpapers using backend saliency maps.
- **Batch Importer:** A drag-and-drop tool for bulk collection management with real-time progress tracking via SSE.
