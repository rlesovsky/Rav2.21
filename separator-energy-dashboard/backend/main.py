# =============================================================================
# main.py — FastAPI Application Entry Point
# Driftwood Dairy Separator Energy Cost Dashboard
# Texas Automation Systems
#
# Serves both the API (/api/*) and the React frontend (static files).
# Single container — no nginx required.
# =============================================================================

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

load_dotenv()

from routers.energy import router as energy_router

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Static files path — React build output
# In Docker: /app/static   (copied during build)
# Local dev: won't exist, frontend runs on Vite dev server
# ---------------------------------------------------------------------------
STATIC_DIR = Path(__file__).parent / "static"

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Separator Energy Cost Dashboard",
    description="Driftwood Dairy — El Monte, CA  |  Texas Automation Systems",
    version="1.0.0",
)

# CORS — only needed for local dev (Vite on :5173 → API on :8000)
# In production the frontend is served from the same origin.
_default_origins = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API Routes (must be registered BEFORE the static file catch-all)
# ---------------------------------------------------------------------------
app.include_router(energy_router)


@app.get("/health")
async def health():
    """Simple health check."""
    return {"status": "ok", "service": "separator-energy-dashboard"}


# ---------------------------------------------------------------------------
# Serve React frontend (static files + SPA fallback)
# ---------------------------------------------------------------------------
if STATIC_DIR.is_dir():
    logger.info("Serving React frontend from %s", STATIC_DIR)

    # Serve static assets (JS, CSS, images, favicon, etc.)
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    # Catch-all: serve index.html for any non-API route (React SPA routing)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve React index.html for client-side routing."""
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
else:
    logger.info("No static directory found at %s — API-only mode", STATIC_DIR)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Separator Energy Dashboard...")
    uvicorn.run("main:app", host="0.0.0.0", port=3030, reload=True)
