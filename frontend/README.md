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
*   **`src/pages/`**: High-level page orchestrators (Library, Artists, Tools).
*   **`src/pages/sets/components/`**: Modular library components like `SetCard`, `ImageGridItem`, and `Lightbox`.
*   **`src/utils/`**: Centralized utilities (e.g., `fileUtils.ts` for path and URL handling).
*   **`electron/`**: Main process and preload scripts for native OS features.

### 🏠 Main Views
*   **Library (Sets):** Visual grid with live search and type-based filtering.
*   **Artist Hub (Creators):** Portfolio views showcasing an artist's full collection with merge capabilities.
*   **Tools:** Specialized utilities for batch importing and saliency-aware image cropping.

---

## 🚦 Development

### Setup
Requires **Node.js 20+**.
```powershell
npm install
```

### Running the Shell
```powershell
npm run dev
```

### API Integration
We use **Orval** to maintain type safety across the stack.
1.  Ensure the backend is running.
2.  Run `npm run generate` to update the hooks in `src/api/generated/`.

---

## 🎨 Advanced Features
- **Native OS Integration:** Open any set's folder directly in Windows Explorer via Electron's `shell` module.
- **Precision Cropper:** A dedicated UI for creating perfect aspect-ratio crops for wallpapers using backend saliency maps.
- **Batch Importer:** A drag-and-drop tool for bulk collection management with real-time progress tracking via SSE.
