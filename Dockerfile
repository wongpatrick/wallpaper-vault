# Multi-stage Dockerfile for hosted Wallpaper Vault demo

# ==============================================================================
# Stage 1: Build Web SPA Frontend
# ==============================================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Pass demo mode env flag to Vite build
ENV VITE_DEMO_MODE=true
ENV VITE_API_BASE_URL=""

RUN npm run build:web

# ==============================================================================
# Stage 2: Python Backend with Static SPA
# ==============================================================================
FROM python:3.11-slim AS runner

# Install system dependencies (libgl1 for OpenCV)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv package manager
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Install Python backend dependencies
COPY backend/pyproject.toml backend/README.md ./backend/
WORKDIR /app/backend
RUN uv sync --no-dev

# Copy backend application source
COPY backend/ ./

# Copy built web frontend into static directory served by FastAPI
COPY --from=frontend-builder /app/frontend/dist-web ./static

# Create persistent storage directories for DB and library
RUN mkdir -p /app/db /app/library

# Configure default environment for hosted public demo
ENV DEMO_MODE=true
ENV API_KEY=""
ENV CORS_ORIGINS="*"
ENV DATABASE_URL="sqlite+aiosqlite:////app/db/wallpapers.db"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Run FastAPI backend
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
