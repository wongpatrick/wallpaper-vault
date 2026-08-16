# Wallpaper Vault

A production-ready desktop application and engine for managing, cataloging, and dynamically rotating high-resolution wallpaper collections across multi-monitor setups.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Vision
Wallpaper Vault is more than just a gallery—it's a centralized hub for your digital aesthetics.

*   **Host Anywhere & Connect Remotely:** Run locally or host the backend engine on a remote server or NAS. The desktop shell seamlessly connects to local or remote vaults via API key authentication.
*   **Native Multi-Monitor Rotation:** Native display alignment and rotation engine powered by a persistent Windows COM daemon for instantaneous, flicker-free desktop wallpaper updates without third-party dependencies.
*   **API-First Ecosystem:** Exposes rich REST endpoints (e.g. for **DisplayFusion** or external scripts) to serve randomized or playlist-driven wallpapers with aspect ratio filters.

---

## 🏗️ Architecture
This project is built using a **Decoupled Engine & Shell** architecture:

*   **The Engine (Backend):** High-performance **FastAPI** application managing a SQLite database via **SQLAlchemy 2.0 (Async)** with **aiosqlite**, OpenCV saliency processing, and WD14 ONNX tagging.
*   **The Shell (Frontend):** Modern **Electron** desktop application built with **React 19 (Vite)**, **TypeScript**, and **Mantine UI v7**.
*   **Native Windows Engine:** Persistent background PowerShell daemon (`psDaemon`) using the `IDesktopWallpaper` COM interface for fast multi-monitor layout mapping, positioning, and rotation.
*   **Real-time Communication:** **Server-Sent Events (SSE)** provide live task progression and notifications for background jobs (imports, audits).
*   **Resilience & Supervision:** Electron manages backend process lifecycle with continuous health monitoring and auto-reconnection (`BackendStatusGuard`).

---

## 📁 Project Structure
```text
wallpaper-vault/
├── backend/        # FastAPI application (Python 3.14+ / uv)
│   ├── app/        # Core API & business logic
│   │   ├── api/    # REST Endpoints (Creators, Images, Sets, Playlists, Rotation, Settings)
│   │   ├── core/   # Configuration, SSE Tasks, Saliency Cropper, Windows Daemon
│   │   ├── crud/   # Async database operations
│   │   ├── db/     # Database engine & migrations
│   │   ├── models/ # SQLAlchemy ORM models
│   │   ├── schemas/# Pydantic validation schemas
│   │   └── services/# Services (Import Pipeline, Audit, Rotation, Set/Creator Management)
│   ├── scripts/    # Database bootstrapping & model downloader
│   ├── tests/      # Pytest test suite with coverage
│   └── README.md   # Backend technical documentation
├── frontend/       # Electron + React application (Node.js 20+ / npm)
│   ├── electron/   # Main & Preload scripts (Native IPC, Tray, Window management)
│   ├── src/        # React UI components (Mantine UI v7, React Query v5)
│   │   ├── api/    # Orval-generated API client & custom Axios instance
│   │   ├── components/ # Shared components, Navigation, Global Search Omnibar
│   │   ├── pages/  # Feature pages (Dashboard, Sets, Creators, Playlists, Rotation, Tools)
│   │   └── providers/  # Backend status supervisor, SSE Tasks & Notifications
│   ├── tests/      # Vitest component tests & Playwright E2E suites
│   └── README.md   # Frontend technical documentation
├── db/             # Schema definitions and database initialization scripts
└── scripts/        # Automation tools and Windows installer packaging (NSIS + PyInstaller)
```

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.14+** and **[uv](https://github.com/astral-sh/uv)**
- **Node.js 20+** and **npm**

### Quick Start (Full Stack)
The easiest way to run the entire application in development mode:
```powershell
cd frontend
npm install
npm run dev
```
*(This concurrently spins up the FastAPI backend and Vite/Electron frontend with automatic Orval client generation).*

---

### Individual Service Setup

#### 1. Backend Engine
```powershell
cd backend
uv sync

# (Optional) Pre-download default ONNX model weights
uv run python scripts/bootstrap_models.py

# Start FastAPI server
uv run uvicorn app.main:app --reload
```
*   **Interactive API Docs:** Available at `http://localhost:8000/docs`.

#### 2. Frontend Desktop Shell
```powershell
cd frontend
npm install
npm run dev:frontend
```

---

## 🛠️ Features & Current State

### 🖥️ Native Multi-Monitor Rotation Engine
- **Windows Display Alignment:** Accurately maps physical and virtual monitor coordinate systems, handling multi-monitor scaling and DPI differences.
- **Persistent COM Daemon:** Uses an ultra-fast, persistent background PowerShell daemon leveraging Windows `IDesktopWallpaper` COM interfaces for flicker-free rotation.
- **Rotation Profiles & Calendar Rules:** Schedule playlists and wallpaper rotation rules across a visual monthly calendar or switch profiles dynamically.
- **Style Positioning:** Full control over wallpaper fitting (`Fit`, `Fill`, `Stretch`, `Center`, `Span`).
- **Rotation Controls:** Searchable playlist selectors and instant Pause / Resume rotation toggles.
- **External Display Manager Support:** REST endpoints (`/api/images/random/...`) remain fully compatible with external tools like DisplayFusion.

### 📂 Playlists & Collections
- **Manual Playlists:** Drag-and-drop custom ordering across sets and creators.
- **Smart Playlists:** Dynamic rule-based filtering matching tags, creators, franchises, characters, ratings, and aspect ratios.
- **Aspect Ratio Filtering:** Automatically filter pools by orientation (e.g. Ultra-wide, 16:9, Portrait).

### 🏷️ Taxonomy & Tagging System
- **Per-Image Tagging:** Tag individual images with fine-grained tags, character associations, and franchise universe links.
- **Characters & Franchises:** Relational subject tracking with popularity sorting (by set/wallpaper count).
- **Taxonomy Management:** Live wallpaper count statistics, bulk tag/character/franchise deletion, and fast filtering.
- **Creator Hub:** Creator profiles with portfolio statistics, social media links (Twitter/X, Pixiv, ArtStation, Patreon), creator merging, and inline creator creation inside the Set modal.

### 📚 Library & File Management
- **Global Search (Omnibar):** Instant fuzzy search across sets, creators, characters, and franchises with breadcrumb navigation.
- **Dedicated Hubs:** Searchable, filterable, and sortable entry points for Sets, Creators, and Taxonomy.
- **File System Sync:** Automatic physical folder creation on set creation, and safe folder cleanup with transactional database rollback on set deletion.
- **Draft State Protection:** Discard confirmation alerts to prevent accidental loss of edits in Set forms.
- **Set Detail & Lightbox:** High-resolution gallery view with keyboard navigation and fullscreen lightbox.

### 🔒 Remote Vault & Security
- **Remote Connection:** Seamlessly connect desktop shell instances to a remote FastAPI backend on a NAS or home server.
- **API Key Security:** Protected API endpoints via `X-API-Key` headers or query parameters.
- **Process Supervisor (`BackendStatusGuard`):** Live backend health monitoring, automatic reconnection attempts, and graceful state handling.

### ⚙️ Advanced Tools & Automation
- **Batch Importer:** Multi-phase pipeline (Gather, Regex Parse & Validate, Execute) with SSE live progress broadcasting, automatic empty source folder cleanup, and stale thumbnail purging.
- **Precision Cropper:** Saliency map detection (Spectral Residual) to compute the visual focal point and crop wallpapers to custom aspect ratios.
- **Audit & Repair:** Perceptual Hashing (`pHash`) duplicate image detection and database/filesystem consistency auditing with detailed logs.

---

## 📦 Packaging & Distribution

Build a standalone Windows installer bundling the compiled Python engine and Electron application:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-app.ps1
```
*   Compiles the backend using **PyInstaller** (onedir mode).
*   Packages the Electron frontend and assets into an **NSIS Installer** via **electron-builder**.
*   Output installer is placed in `frontend/dist-build/`.

---

## 🧪 Testing & Code Quality

### Backend
```powershell
cd backend
uv run ruff check .          # Linting
uv run pytest               # Unit and integration tests with coverage
```

### Frontend
```powershell
cd frontend
npm run lint                # ESLint
npm run test                # Vitest unit & component tests
npm run coverage            # Test coverage report
npm run test:e2e            # Playwright end-to-end tests
```

---

## 💡 Developer Notes
- **API Client Generation:** TypeScript models and React Query hooks are generated with **Orval**. Run `npm run generate` in `frontend/` after updating backend schemas. (Generated files in `frontend/src/api/` are automatically produced during development/build steps).
- **Styling Architecture:** Styled using **Mantine UI v7** with centralized theme overrides for cohesive dark/light desktop styling.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
