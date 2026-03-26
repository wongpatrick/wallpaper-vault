# Wallpaper Vault

A production-ready desktop application for managing high-resolution wallpaper collections. 

## 🏗️ Architecture
This project is built using a **Decoupled Engine & Shell** architecture:

*   **The Engine (Backend):** A high-performance **FastAPI** server managing a SQLite database (via SQLAlchemy 2.0).
*   **The Shell (Frontend):** A modern **Electron** desktop application built with **React (Vite)** and TypeScript.

---

## 📁 Project Structure
```text
wallpaper-vault/
├── backend/        # FastAPI application (Python 3.12+ / uv)
│   ├── app/        # Core API logic (Models, Schemas, CRUD, Routes)
│   └── README.md   # Backend implementation plan
├── frontend/       # Electron + React application (Node.js / npm)
│   ├── electron/   # Main & Preload scripts for the desktop shell
│   ├── src/        # React UI components and state
│   └── README.md   # Frontend implementation plan
├── db/             # SQLite database and schema.sql
└── scripts/        # Utility and automation scripts
```

---

## 🚀 Getting Started

### 1. The Engine (Backend)
Requires **Python 3.12+** and **uv**.
```powershell
cd backend
uv sync
uv run uvicorn app.main:app --reload
```
*   **API Docs:** Visit `http://localhost:8000/docs` to see the interactive documentation.

### 2. The Shell (Frontend)
Requires **Node.js 20+**.
```powershell
cd frontend
npm install
npm run dev
```
*   **Desktop App:** A window will launch automatically, connecting to your Vite dev server.

---

## 🛠️ Current Progress
- [x] **Phase 1 (Backend):** Initialization, Models, and Database Session setup.
- [x] **Phase 2 (Backend):** Creators & Sets (Schemas, CRUD, and API Routes).
- [x] **Phase 1 (Frontend):** Electron Shell initialization with Vite + React.
- [ ] **Phase 2 (Frontend):** Connecting the UI to the FastAPI "Engine."

---

## 💡 Developer Notes
- Ensure the **Backend** is running before launching the **Frontend** to see live data.
- SQLite constraints (like `UNIQUE`) are enforced at the database layer and handled gracefully in the API.
