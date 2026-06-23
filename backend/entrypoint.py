"""
Main entry point script for freezing the FastAPI application with PyInstaller.
Parses command line arguments (like --port) and starts the Uvicorn server.
"""
import os
import sys
import uvicorn

# Ensure the backend directory is in sys.path so app module can be found
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

if __name__ == "__main__":
    # Default port is 8000. Let's parse custom port if provided.
    port = 8000
    for arg in sys.argv:
        if arg.startswith("--port="):
            try:
                port = int(arg.split("=")[1])
            except ValueError:
                pass
        elif arg == "--port" and len(sys.argv) > sys.argv.index(arg) + 1:
            try:
                port = int(sys.argv[sys.argv.index(arg) + 1])
            except ValueError:
                pass

    print(f"Starting Wallpaper Vault backend server on port {port}...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="info")
