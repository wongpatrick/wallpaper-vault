# PowerShell script to automate building the Wallpaper Vault Windows installer.
# Generates a clean database template, compiles the FastAPI backend via PyInstaller,
# builds the frontend assets, and bundles everything into an NSIS installer using electron-builder.

$ErrorActionPreference = "Stop"

Write-Host "=== Starting Wallpaper Vault Packaging Pipeline ===" -ForegroundColor Green

# 1. Clean previous builds
Write-Host "Cleaning up previous build artifacts..." -ForegroundColor Cyan
$backendDist = "$PSScriptRoot/../backend/dist"
$frontendBuild = "$PSScriptRoot/../frontend/dist-build"
$frontendDist = "$PSScriptRoot/../frontend/dist"
$frontendDistElectron = "$PSScriptRoot/../frontend/dist-electron"

if (Test-Path $backendDist) { Remove-Item -Path $backendDist -Recurse -Force }
if (Test-Path $frontendBuild) { Remove-Item -Path $frontendBuild -Recurse -Force }
if (Test-Path $frontendDist) { Remove-Item -Path $frontendDist -Recurse -Force }
if (Test-Path $frontendDistElectron) { Remove-Item -Path $frontendDistElectron -Recurse -Force }

# 2. Generate clean template database
Write-Host "Generating clean database template..." -ForegroundColor Cyan
$cleanDbDir = "$PSScriptRoot/../backend/dist/clean_db"
New-Item -ItemType Directory -Force -Path $cleanDbDir | Out-Null
$cleanDbPath = Resolve-Path "$cleanDbDir"
$dbFile = "$cleanDbPath/wallpapers.db"

# Temporarily override DATABASE_URL env var so init_db initializes the clean file
$env:DATABASE_URL = "sqlite+aiosqlite:///$($dbFile.Replace('\', '/'))"
Push-Location "$PSScriptRoot/../backend"
try {
    uv run python scripts/init_db.py
} finally {
    $env:DATABASE_URL = $null
    Pop-Location
}

if (-not (Test-Path $dbFile)) {
    throw "Failed to create clean database template at $dbFile"
}
Write-Host "Clean database template successfully generated." -ForegroundColor Green

# 3. Compile Backend with PyInstaller
Write-Host "Freezing FastAPI backend with PyInstaller (onedir mode)..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot/../backend"
try {
    uv run pyinstaller --noconfirm --onedir --name=wallpaper-vault-backend `
        --add-data "app;app" `
        --collect-all uvicorn `
        --collect-all fastapi `
        --collect-all sqlalchemy `
        --collect-all aiosqlite `
        --collect-all cv2 `
        --collect-all onnxruntime `
        --collect-all structlog `
        --collect-all PIL `
        --collect-all huggingface_hub `
        entrypoint.py
} finally {
    Pop-Location
}

$backendBinary = "$PSScriptRoot/../backend/dist/wallpaper-vault-backend/wallpaper-vault-backend.exe"
if (-not (Test-Path $backendBinary)) {
    throw "Failed to compile backend. Expected binary not found at $backendBinary"
}
Write-Host "Backend compiled successfully." -ForegroundColor Green

# 4. Compile Frontend & package App
Write-Host "Building React frontend and packaging Electron app..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot/../frontend"
try {
    # Ensure package-lock is satisfied and run electron-builder
    npm install
    npm run build-app
} finally {
    Pop-Location
}

Write-Host "=== Packaging Completed Successfully! ===" -ForegroundColor Green
Write-Host "Installer package is available in: $frontendBuild" -ForegroundColor Green
