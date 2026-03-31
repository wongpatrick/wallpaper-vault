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
- [x] **API Integration:** Automatic TypeScript client generation via **Orval**.
- [x] **UI Framework:** Fully themed interface using **Mantine UI v7**.
- [x] **Advanced Tools:**
    - **Folder Parser:** Automatically scan and organize local wallpaper directories.
    - **Precision Cropper:** Custom tool for perfectly fitting wallpapers to any aspect ratio.

---

## 💡 Developer Notes
- **API Generation:** If backend models change, run `npm run generate-api` in the `frontend` directory to update the TypeScript hooks.
- **Styling:** We prefer **Mantine** components for UI primitives and **Vanilla CSS / CSS Modules** for custom layouts.
- **Database:** Uses SQLite for local-first storage. Schema is managed in `db/schema.sql`.
