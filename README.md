# Wallpaper Vault

A production-ready desktop and web application and engine for managing, cataloging, and dynamically rotating high-resolution wallpaper collections across multi-monitor setups.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Vision
Wallpaper Vault is a self-hostable, federated digital asset manager and rotation engine tailored for high-resolution wallpaper collections and multi-monitor setups. It bridges personal desktop customization and centralized media storage:

*   **Decoupled & Flexible:** Run as a native Windows desktop application with deep OS integration, or access your catalog through a standalone browser Web SPA.
*   **Federated & Scalable:** Manage wallpapers across multiple storage drives, remote servers, or NAS instances from a single unified interface.
*   **Automation-Ready:** Native multi-monitor rotation, AI-assisted tagging, saliency-aware cropping, and full REST API compatibility with external display managers like DisplayFusion.

---

## 🏗️ Architecture
Wallpaper Vault uses a **Decoupled Engine & Shell** architecture:

*   **Backend Engine (FastAPI):** Asynchronous Python service handling persistence (SQLAlchemy 2.0 Async / SQLite via aiosqlite), computer vision (OpenCV Spectral Residual saliency), and ML inference (WD14 ONNX tagging).
*   **Frontend Shell (React 19 / Vite):** Modern web application built with TypeScript, Mantine UI v7, and TanStack Query v5, designed to run inside Electron or in a standalone browser.
*   **Platform Strategy Layer:** The unified `VaultProvider` delegates storage through swappable adapters: `ElectronVaultAdapter` (native IPC and secure local storage) for desktop, and `WebLocalStorageVaultAdapter` for browser environments.
*   **Modular Native Services:** The Electron main process is decoupled into specialized asynchronous services for rotation coordination (`rotationCoordinator`), the Windows COM wallpaper daemon (`powerShellDaemon`), monitor layout mapping (`monitorLayout`), backend process management (`backendProcess`), and the system tray (`trayManager`). The `vaultRegistry` handles vault persistence and background health monitoring.
*   **Reactive Streaming:** Server-Sent Events (SSE) broadcast live progress and notifications for long-running background tasks (batch imports, library scans, database audits).
*   **Connection Guarding:** `BackendStatusGuard` blocks the UI when the active vault is offline or unauthorized and offers switching to another registered vault.

---

## 📁 Project Structure
```text
wallpaper-vault/
├── backend/            # FastAPI application (Python 3.14+ / uv)
│   ├── app/            # Core API, CRUD, database models, schemas & services
│   │   ├── api/        # REST Endpoints (Creators, Sets, Images, Playlists, Vault, Library Paths)
│   │   ├── core/       # Tasks broadcaster, saliency cropper, demo sandbox & logging
│   │   ├── crud/       # Database access layer and cross-vault queries
│   │   ├── db/         # SQLAlchemy async session
│   │   ├── models/     # Relational database models
│   │   ├── schemas/    # Pydantic request/response schemas
│   │   └── services/   # Business logic (Import, Library Scanner, Audit, AI Tagging, Cache, Sets)
│   ├── scripts/        # Model bootstrapping & demo seeding utilities
│   ├── tests/          # Pytest suite with coverage
│   └── README.md       # Backend documentation
├── frontend/           # Electron + React application (Node.js 20+ / npm)
│   ├── electron/       # Main & preload scripts, vault registry & modular services
│   ├── src/            # React client (Mantine UI v7, TanStack Query v5)
│   │   ├── api/        # Orval-generated API client & Axios instance
│   │   ├── components/ # Reusable UI components & modals
│   │   ├── context/    # VaultProvider, TaskProvider & NotificationProvider
│   │   ├── hooks/      # Shared hooks (multi-vault queries, SSE task stream, URL state)
│   │   ├── pages/      # Feature views (Dashboard, Images, Sets, Creators, Playlists, Taxonomy, Rotation, Tools, Settings)
│   │   └── utils/      # Modular helper utilities (imageUrl, fileDrop, formatBytes)
│   ├── tests/          # Playwright E2E suites (Vitest tests are colocated in src/)
│   ├── vite.config.ts  # Desktop/Electron build configuration
│   ├── vite.config.web.ts # Web SPA build configuration
│   └── README.md       # Frontend documentation
├── db/                 # Database schema definitions and initialization scripts
├── scripts/            # Packaging automation (NSIS + PyInstaller) & database migration scripts
├── Dockerfile          # Multi-stage container build (FastAPI + Web SPA)
└── docker-compose.yml  # Docker Compose definition for hosted or demo deployments
```

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.14+** with **[uv](https://github.com/astral-sh/uv)**
- **Node.js 20+** with **npm**

---

### Installation
```powershell
# 1. Install frontend dependencies
cd frontend
npm install

# 2. Install backend dependencies
cd ../backend
uv sync

# (Optional) Pre-download default ONNX AI tagging models
uv run python scripts/bootstrap_models.py
```

---

### Development Targets

Choose your preferred development target:

| Target | Command | Description |
|---|---|---|
| **Full Stack Desktop** | `npm run dev` *(in `frontend/`)* | Spins up FastAPI backend and Vite/Electron desktop shell concurrently. |
| **Browser Web SPA** | `npm run dev:web` *(in `frontend/`)* | Runs the FastAPI backend and browser-only Vite frontend. |
| **Demo Sandbox** | `npm run dev:demo` *(in `frontend/`)* | Runs the backend with `.env.demo` and the web frontend in demo mode. |
| **Standalone Backend** | `uv run uvicorn app.main:app --reload` *(in `backend/`)* | Runs the FastAPI API server on `http://localhost:8000` (docs at `/docs`). |
| **Standalone Frontend** | `npm run dev:frontend` *(in `frontend/`)* | Runs the desktop Vite dev server independently. |

---

### Docker Deployment
Build and run the containerized application (FastAPI backend serving the pre-built Web SPA with demo sandbox protection enabled):
```powershell
docker-compose up --build
```
Access the application at `http://localhost:8000`.

---

## 🛠️ Features & Current State

### 🌐 Multi-Vault Federation & Registry
- **Vault Registry:** Register, configure, and monitor multiple local or remote vaults with distinct URLs, API keys, and color badges.
- **Fast Context Switching:** Switch active vault contexts dynamically via the navbar `VaultSwitcher` with real-time health badges.
- **Aggregated Catalog View:** Seamlessly browse, search, and filter sets, creators, and wallpapers across all registered vaults simultaneously.

### 🗄️ Multi-Path Library Storage
- **Storage Pooling:** Distribute wallpapers across multiple storage paths (secondary drives, external storage, or network shares) under a single vault database.
- **Capacity Monitoring:** Live disk usage and free space tracking per configured storage root in Settings.
- **Multi-Path Library Scanner:** Background service crawling all configured paths to automatically detect, index, and reconcile folders.
- **Target Storage Selection:** Select target storage paths when creating sets or importing archives.

### 🖥️ Native Multi-Monitor Rotation Engine
- **Windows Display Alignment:** Maps physical and virtual monitor coordinates, accommodating mixed DPI, resolutions, and orientation layouts.
- **Persistent COM Daemon:** Background PowerShell daemon leveraging Windows `IDesktopWallpaper` for instantaneous, flicker-free desktop wallpaper updates.
- **Cross-Vault Caching:** Automatically downloads and caches remote vault images locally so remote collections rotate seamlessly through the Windows COM daemon.
- **Rotation Profiles & Calendar Rules:** Schedule playlists and wallpaper rotation rules across a visual monthly calendar, or toggle profiles on demand.
- **Display Positioning:** Full control over wallpaper fitting (`Fit`, `Fill`, `Stretch`, `Center`, `Span`).
- **External Display Manager Support:** REST endpoints (`/api/images/random/...`) remain compatible with external tools like DisplayFusion.

### 📊 Dashboard & Visual Analytics
- **Dual Word Clouds:** Separate, interactive word clouds distinguishing set-level metadata tags from image-level tags, characters, and franchises.
- **Inspiration Carousel:** Live inspiration card with automatic wallpaper rotation and quick preview.
- **System Metrics:** Real-time metrics for total wallpapers, sets, creators, disk usage, and database health.

### 📂 Playlists & Collections
- **Manual Playlists:** Custom ordering across sets, creators, and cross-vault assets.
- **Cross-Vault Picker:** Search and assemble wallpapers from any connected vault into unified playlists using `CrossVaultImagePickerModal`.
- **Smart Playlists:** Dynamic rule-based filtering matching tags, creators, franchises, characters, ratings, and aspect ratios.
- **Aspect Ratio Filtering:** Instant filtering by orientation (e.g. Ultra-wide, 16:9, Portrait).

### 🏷️ Taxonomy & AI Auto-Tagging
- **Relational Subject Tracking:** Fine-grained per-image tags, characters, and franchise universe groupings.
- **AI Auto-Tagging:** Built-in WD14 ONNX tagging with configurable confidence thresholds, batch processing, and auto-cleanup.
- **Taxonomy Hub:** Deduplicated CRUD interface (`GenericTaxonomyTab`) with live wallpaper counts, merging, and bulk operations.
- **Creator Hub:** Creator portfolios with social media links (Twitter/X, Pixiv, Patreon, Fantia, Bilibili, YouTube, or custom URLs) and profile merging.

### 📚 Library & File Management
- **Global Search (Omnibar):** Instant fuzzy search across sets, creators, characters, and franchises with breadcrumb navigation.
- **Color Explorer:** Filter the image gallery by color with adjustable match tolerance.
- **Set Detail & Lightbox:** Modular high-resolution gallery view with keyboard navigation and fullscreen lightbox.
- **File System Integrity:** Automatic folder creation, safe folder cleanup with transactional database rollback on set deletion, and unsaved changes protection.

### ⚙️ Advanced Tools & Automation
- **Modular Batch Importer:** Multi-phase pipeline (Gather, Regex Parse & Validate, Execute) with SSE progress broadcasting, empty folder cleanup, and stale thumbnail purging.
- **Saliency-Aware Precision Cropper:** Spectral Residual saliency map detection to compute focal points and generate custom aspect-ratio crops.
- **Audit & Repair:** Perceptual Hashing (`pHash`) duplicate image detection and database/filesystem consistency auditing.

### 🐳 Hosted Demo & Sandbox Environment
- **Demo Sandbox Guard:** `DemoSandboxMiddleware` intercepts mutating API operations (POST, PUT, PATCH, DELETE) to allow safe public evaluation without file modification.
- **Rate Limiting:** Built-in SlowAPI rate limiting to safeguard public endpoints against abuse.

---

## ⚡ Performance & Quality
- **Database Indexing:** Composite and single-column indices on foreign keys (`set_id`, `creator_id`, `library_path_id`), sort fields (`created_at`, `updated_at`, `rating`), and junction tables for sub-millisecond querying.
- **Async I/O & N+1 Query Elimination:** Optimized SQLAlchemy joined and selectin loading strategies across sets, images, and taxonomy relationships.
- **Frontend Code Splitting & Virtualization:** Route-level lazy loading with `React.lazy` and virtualized grid rendering for large collections.
- **State Decoupling:** Isolated `TaskProvider`, `NotificationProvider`, and `VaultProvider` contexts to prevent unnecessary React re-renders.

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
