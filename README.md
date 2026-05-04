# Wallpaper Vault

A production-ready desktop application for managing high-resolution wallpaper collections. 

## 🏗️ Architecture
This project is built using a **Decoupled Engine & Shell** architecture:

*   **The Engine (Backend):** A high-performance **FastAPI** server managing a SQLite database via **SQLAlchemy 2.0**.
*   **The Shell (Frontend):** A modern **Electron** desktop application built with **React (Vite)**, **TypeScript**, and **Mantine UI**.

---

## 📁 Project Structure
```text
wallpaper-vault/
├── backend/        # FastAPI application (Python 3.12+ / uv)
│   ├── app/        # Core API logic (Models, Schemas, CRUD, Routes)
│   └── README.md   # Backend technical documentation
├── frontend/       # Electron + React application (Node.js / npm)
│   ├── electron/   # Main & Preload scripts for the desktop shell
│   ├── src/        # React UI components and state
│   └── README.md   # Frontend technical documentation
├── db/             # SQLite database and schema definitions
└── scripts/        # Utility and automation scripts
```

---

## 🚀 Getting Started

### 1. The Engine (Backend)
Requires **Python 3.12+** and **[uv](https://github.com/astral-sh/uv)**.
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
*   **Desktop App:** A window will launch automatically, connecting to the Vite dev server.

---

## 🛠️ Current State
- [x] **Backend Core:** Models, Schemas, and CRUD for Creators, Sets, and Images.
- [x] **Desktop Shell:** Electron integration with React and IPC bridge.
- [x] **Library Management:**
    - Immersive **Library Grid** with cover images and metadata.
    - **Set Detail View** with image gallery and full-screen lightbox.
    - **Artist Hub (Creators):** Portfolio views and metadata management.
- [x] **Advanced Features:**
    - **Batch Importer:** Multi-phase background import pipeline with regex parsing.
    - **Native Integration:** "Open Folder" feature using Electron's shell module.
    - **Search & Filtering:** Live library filtering by title, artist, and type.
    - **Merge Tool:** Consolidate duplicate artist profiles safely.
- [x] **Precision Tools:**
    - **Folder Parser:** Automatically scan and organize local wallpaper directories.
    - **Precision Cropper:** Custom tool for perfectly fitting wallpapers to any aspect ratio.

---

## 📋 Roadmap (To-Do)
- [ ] **Library Repair Utility:** Automated tool to fix broken paths and re-sync database with filesystem.
- [ ] **Smart Duplicate Detection:** Identify identical wallpapers using pHash (Perceptual Hashing).
- [ ] **Bulk Metadata Editing:** Select multiple sets to categorize or rename in one go.
- [ ] **Custom Themes:** User-selectable accent colors and dark/light mode persistence.
- [ ] **Wallpaper Engine Integration:** (Optional) Support for animated wallpapers and direct "Set as Wallpaper" triggers.

---

## 💡 Developer Notes
- **API Generation:** If backend models change, run `npm run generate` in the `frontend` directory.
- **Styling:** We use **Mantine UI v7** for all core components.
- **Path Handling:** All filesystem paths are normalized to ensure cross-platform compatibility.
