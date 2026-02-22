# =============================================================================
# main.py — FastAPI Application Entry Point
# Driftwood Dairy Separator Energy Cost Dashboard
# Texas Automation Systems
# =============================================================================

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Separator Energy Cost Dashboard",
    description="Driftwood Dairy — El Monte, CA  |  Texas Automation Systems",
    version="1.0.0",
)

# CORS — configurable via CORS_ORIGINS env var (comma-separated)
# Default: Vite dev server + common local origins
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
# Routes
# ---------------------------------------------------------------------------
app.include_router(energy_router)


@app.get("/health")
async def health():
    """Simple health check."""
    return {"status": "ok", "service": "separator-energy-dashboard"}


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Separator Energy Dashboard backend...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
