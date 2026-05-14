# Wallpaper Vault

A production-ready desktop application for managing high-resolution wallpaper collections. 

## 🏗️ Architecture
This project is built using a **Decoupled Engine & Shell** architecture:

*   **The Engine (Backend):** A high-performance **FastAPI** server managing a SQLite database via **SQLAlchemy 2.0 (Async)**.
*   **The Shell (Frontend):** A modern **Electron** desktop application built with **React 19 (Vite)**, **TypeScript**, and **Mantine UI v7**.
*   **Real-time Communication:** Uses **Server-Sent Events (SSE)** to provide live updates for background tasks.
*   **Process Management:** Electron autonomously manages the lifecycle of the FastAPI backend and provides deep OS integration.

---

## 📁 Project Structure
```text
wallpaper-vault/
├── backend/        # FastAPI application (Python 3.14+ / uv)
│   ├── app/        # Core API logic
│   │   ├── api/    # REST Endpoints (Creators, Images, Sets, Settings)
│   │   ├── core/   # Business Logic (Saliency-aware Cropping, SSE Tasks, Audit)
│   │   ├── crud/   # Database operations
│   │   ├── models/ # SQLAlchemy models
│   │   ├── schemas/# Pydantic validation
│   │   └── services/# Complex services (Import Pipeline, Audit)
│   └── README.md   # Backend technical documentation
├── frontend/       # Electron + React application (Node.js / npm)
│   ├── electron/   # Main & Preload scripts (Tray, IPC, Window management)
│   ├── src/        # React UI components (Mantine UI)
│   └── README.md   # Frontend technical documentation
├── db/             # SQLite database and schema definitions
└── scripts/        # Utility and automation scripts
```

---

## 🚀 Getting Started

### 1. The Engine (Backend)
Requires **Python 3.14+** and **[uv](https://github.com/astral-sh/uv)**.
```powershell
cd backend
uv sync
uv run uvicorn app.main:app --reload
```
*   **API Docs:** Visit `http://localhost:8000/docs` for interactive OpenAPI documentation.

### 2. The Shell (Frontend)
Requires **Node.js 20+**.
```powershell
cd frontend
npm install
npm run dev
```
*   **Desktop App:** A window will launch automatically, connecting to the Vite dev server and the backend.

---

## 🛠️ Current State

### ✅ Library Management
- **Library Grid:** Immersive browsing with cover images and rich metadata.
- **Artist Hub:** Dedicated views for creators with portfolio stats and merging tools.
- **Set Detail:** Full gallery view with lightbox support.

### ✅ Advanced Tools
- **Precision Cropper:** Uses **Saliency Maps (Spectral Residual)** to automatically identify the "center of interest" and crop wallpapers to custom aspect ratios.
- **Batch Importer:** A robust, multi-phase background pipeline that uses regex to parse folder structures and handle duplicates.
- **Audit & Repair:** Perceptual Hashing (phash) based duplicate detection and filesystem consistency checks.

### ✅ Native Integration
- **System Tray:** Background persistence with a custom context menu and "Minimize to Tray" behavior.
- **DisplayFusion Support:** Custom API endpoints (`/api/images/random/file/...`) compatible with DisplayFusion for automatic wallpaper rotation.
- **Native File Shell:** "Open Folder" features integrated with Electron's shell for direct filesystem access.
- **Global Settings:** Centralized configuration store for paths, aspect ratios, and more.

---

## 📋 Roadmap (To-Do)
- [ ] **Find a Working Tray Icon**: Standardize a high-quality icon format (ICO/SVG) that works reliably across all Windows configurations.
- [ ] **Bulk Metadata Editing**: Select multiple sets to categorize or rename in one go.
- [ ] **Custom Themes**: User-selectable accent colors and dark/light mode persistence.
- [ ] **Mobile Companion**: Remote browsing and management via a local network API.

---

## 💡 Developer Notes
- **API Generation:** If backend models change, run `npm run generate` in the `frontend` directory to update the Orval-generated API client.
- **Styling:** We use **Mantine UI v7** for all core components, prioritizing accessibility and modern aesthetics.
- **Task System:** Long-running operations (like imports) are handled via a robust SSE-based task broadcaster for real-time UI feedback.
