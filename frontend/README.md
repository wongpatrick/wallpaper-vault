# Wallpaper Vault: Frontend Shell (Electron + React)

## 🚀 Overview
The "Wallpaper Vault" frontend is a desktop shell built with **Electron** and **React**. It provides a rich, native-like interface for managing wallpaper collections, interacting with the FastAPI engine, and performing advanced image processing.

## 🛠️ Technical Stack
- **Framework:** [React 18+](https://react.dev/) (Vite)
- **Desktop Shell:** [Electron](https://www.electronjs.org/)
- **UI Toolkit:** [Mantine UI v7](https://mantine.dev/)
- **Icons:** [Tabler Icons](https://tabler.io/icons)
- **API Client:** [Axios](https://axios-http.com/) with [Orval](https://orval.dev/) for automatic hook generation.
- **Styling:** CSS Modules and Vanilla CSS.

---

## 🏗️ Architecture
The frontend is designed to be a thin shell that delegates heavy lifting to the backend engine:

*   **`src/api/`**: Generated API client hooks and Axios configuration.
*   **`src/components/`**: Reusable UI components (Layout, UI primitives, Tools).
*   **`src/pages/`**: High-level page orchestrators.
*   **`src/hooks/`**: Custom React hooks for shared logic.
*   **`electron/`**: Main process and preload scripts for desktop integration.

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
This launches the Vite dev server and opens the Electron application window.

### API Integration
We use **Orval** to generate typed React hooks from the backend OpenAPI schema.
1.  Ensure the backend is running.
2.  Run `npm run generate-api` to update the generated hooks in `src/api/generated/`.

---

## 🎨 Advanced Features
- **Precision Cropper**: A dedicated tool for creating perfect aspect-ratio crops for wallpapers.
- **Folder Parser**: A utility to scan local directories and automatically import sets.
- **Side Nav**: Responsive sidebar with a resizable handle for custom layout management.
