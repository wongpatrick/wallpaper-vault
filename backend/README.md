# Wallpaper Vault: Backend Engine (FastAPI)

## 🚀 Overview
The "Wallpaper Vault" backend is a high-performance **FastAPI** application that serves as the engine for the desktop shell. It manages a SQLite database, handles file system interactions, and provides a RESTful API for the frontend.

## 🛠️ Technical Stack
- **Framework:** [FastAPI](https://fastapi.tiangolo.com/) (Asynchronous)
- **Dependency Management:** [uv](https://github.com/astral-sh/uv)
- **ORM:** [SQLAlchemy 2.0](https://www.sqlalchemy.org/)
- **Database:** [SQLite](https://www.sqlite.org/) (Asynchronous via `aiosqlite`)
- **Validation:** [Pydantic v2](https://docs.pydantic.dev/)

---

## 🏗️ Architecture
The backend follows a standard layered architecture for scalability:

*   **`app/api/`**: RESTful routers and endpoint definitions.
*   **`app/core/`**: App configuration and global settings.
*   **`app/crud/`**: Reusable database interaction logic.
*   **`app/db/`**: Connection handling and session management.
*   **`app/models/`**: SQLAlchemy ORM models reflecting the core schema.
*   **`app/schemas/`**: Pydantic models for request/response validation.

---

## 🚦 Development

### Setup
Ensure you have **Python 3.12+** and **uv** installed.
```powershell
uv sync
```

### Running the Engine
```powershell
uv run uvicorn app.main:app --reload
```
The API will be available at `http://localhost:8000`.

### Documentation
FastAPI automatically generates documentation:
- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 📊 Database Schema
The database is managed locally in a SQLite file. Core entities include:
- **Creators:** Artists and photographers.
- **Sets:** Collections of wallpapers with shared metadata.
- **Images:** Individual high-resolution files.
- **Settings:** Persistent application configuration (Key-Value).
- **Tags & Franchises:** Categorization and filtering metadata.

---

## ⚙️ Settings Management
The backend includes a flexible key-value settings system used for application configuration (e.g., library paths, automation toggles).

- **Endpoints:**
    - `GET /api/settings/`: List all settings.
    - `GET /api/settings/{key}`: Get a specific configuration value.
    - `PUT /api/settings/{key}`: Update or create (upsert) a setting.
- **Storage:** Settings are stored in the database to ensure the Engine can access them even when the UI is closed. Values can be simple strings or JSON-formatted strings for complex configurations.
