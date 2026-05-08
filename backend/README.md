# Wallpaper Vault: Backend Engine (FastAPI)

## 🚀 Overview
The "Wallpaper Vault" backend is a high-performance **FastAPI** application that serves as the engine for the desktop shell. It manages a SQLite database, handles file system interactions, and provides a RESTful API for the frontend.

## 🛠️ Technical Stack
- **Framework:** [FastAPI](https://fastapi.tiangolo.com/) (Asynchronous)
- **Dependency Management:** [uv](https://github.com/astral-sh/uv)
- **ORM:** [SQLAlchemy 2.0](https://www.sqlalchemy.org/)
- **Database:** [SQLite](https://www.sqlite.org/) (Asynchronous via `aiosqlite`)
- **Validation:** [Pydantic v2](https://docs.pydantic.dev/)
- **Image Processing:** [OpenCV](https://opencv.org/) with Saliency-based cropping.
- **Linting:** [Ruff](https://github.com/astral-sh/ruff)

---

## 🏗️ Architecture
The backend follows a standard layered architecture:

*   **`app/api/`**: RESTful routers and endpoint definitions.
*   **`app/services/`**: Focused business logic services (e.g., `import_service`).
*   **`app/core/`**: App configuration, **SSE-based task broadcaster**, and saliency-aware crop logic.
*   **`app/crud/`**: Reusable database interaction logic.
*   **`app/db/`**: Connection handling and session management.
*   **`app/models/`**: SQLAlchemy ORM models.
*   **`app/schemas/`**: Pydantic models for request/response validation.

### 🔄 Import Pipeline
The import system is modularized into three distinct phases in `import_service.py`:
1.  **Gather:** Scans local directories for candidates.
2.  **Parse & Validate:** Applies regex templates and checks for duplicates.
3.  **Execute:** Processes images, sanitizes paths, and saves to the database.

### 📡 Real-time Updates
The backend uses **Server-Sent Events (SSE)** via `app/core/tasks.py` to broadcast progress updates for long-running operations (like batch imports) to all connected clients.

---

## 🚦 Development

### Setup
Ensure you have **Python 3.14+** and **uv** installed.
```powershell
uv sync
```

### Running the Engine
```powershell
uv run uvicorn app.main:app --reload
```

### Code Quality
We use **Ruff** for fast and strict linting.
```powershell
uv run ruff check .
```

---

## 📊 Database Schema
Core entities include:
- **Creators:** Artist profiles with portfolios.
- **Sets:** Curated collections of wallpapers.
- **Images:** Individual files with metadata (resolution, pHash).
- **Tasks:** Background operation tracking for long-running imports.
- **Settings:** Global application configuration.
