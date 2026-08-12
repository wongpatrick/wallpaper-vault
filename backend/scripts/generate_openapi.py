"""
Export the OpenAPI specification from the FastAPI app to openapi.json.
This script extracts the OpenAPI schema directly from the FastAPI application instance
and writes it to disk so Orval can generate TypeScript types and React Query hooks.
"""

import json
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.main import app  # noqa: E402


def generate_openapi(output_path: Path | None = None) -> Path:
    """Generate and write the OpenAPI JSON specification."""
    if output_path is None:
        output_path = backend_dir / "openapi.json"

    app.openapi_schema = None
    openapi_schema = app.openapi()
    output_path.write_text(json.dumps(openapi_schema, indent=2), encoding="utf-8")
    print(f"OpenAPI schema successfully generated at: {output_path}")
    return output_path


if __name__ == "__main__":
    generate_openapi()
