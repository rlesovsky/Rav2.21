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
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

from config import I3X_BASE_URL, USE_I3X
from routers.energy import router as energy_router
from services import analytics, historian_client, processing

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
# Lifespan — historian client and processing loop
#
# Order on startup:   historian_client.startup() -> processing.start()
# Order on shutdown:  processing.stop()          -> historian_client.shutdown()
#
# Reverse order on shutdown ensures the processing loop has stopped before
# we close the httpx client it depends on; otherwise a tick mid-shutdown
# would log spurious connection errors.
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "Starting Separator Energy Dashboard (USE_I3X=%s, i3x_base_url=%s)",
        USE_I3X,
        I3X_BASE_URL if USE_I3X else "n/a",
    )
    try:
        await historian_client.startup()
    except Exception as exc:
        logger.error("Historian client startup failed: %s", exc)
        raise
    await processing.start()
    await analytics.start_prewarm()

    yield

    logger.info("Shutting down — stopping prewarm + processing, closing historian client")
    await analytics.stop_prewarm()
    await processing.stop()
    await historian_client.shutdown()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Separator Energy Cost Dashboard",
    description="Driftwood Dairy — El Monte, CA  |  Texas Automation Systems",
    version="1.0.0",
    lifespan=lifespan,
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
    return {"status": "ok", "service": "separator-energy-dashboard"}


@app.get("/api/i3x/info")
async def i3x_info():
    """Diagnostic — local config + on-demand probe of upstream /i3x/info.

    Returns 404 when USE_I3X=false. Otherwise always 200; the upstream probe
    is reported in `upstreamInfoStatus` so ops can distinguish:
        200 -> upstream healthy and exposes /info
        404 -> upstream healthy but does not expose /info (Timebase default)
        0   -> upstream unreachable (network error)
    """
    if not USE_I3X:
        raise HTTPException(status_code=404, detail="i3X mode is disabled (USE_I3X=false)")

    from config import I3X_DATASET, I3X_TAGS
    from services.i3x_client import get_info  # lazy import — legacy path skips

    info, status = await get_info()
    return {
        "backend": "i3x",
        "baseUrl": I3X_BASE_URL,
        "dataset": I3X_DATASET,
        "tagCount": len(I3X_TAGS),
        "upstreamInfo": info,
        "upstreamInfoStatus": status,
    }


# ---------------------------------------------------------------------------
# Serve React frontend (static files + SPA fallback)
# ---------------------------------------------------------------------------
if STATIC_DIR.is_dir():
    logger.info("Serving React frontend from %s", STATIC_DIR)
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
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
    uvicorn.run("main:app", host="0.0.0.0", port=3030, reload=True)
