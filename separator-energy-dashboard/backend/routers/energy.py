# =============================================================================
# routers/energy.py — FastAPI Route Handlers
# =============================================================================
#
# Failure policy:
#   The aggregation endpoints (/summary, /daily, /timeline) catch all
#   exceptions and degrade gracefully: log the traceback and return an
#   empty-shape 200 response. /summary additionally carries a `warning`
#   string so the UI can render a neutral "insufficient data" note instead
#   of a red error box. This was added after a power outage at Driftwood
#   exposed a sparse-boolean code path in state_engine: every Analysis-tab
#   panel returned HTTP 500 because one unhandled exception was bubbling up
#   through the whole window.
# =============================================================================

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Query

from models.schemas import (
    EnergyConfig, RawDebugResponse,
)
from services import historian_client, state_engine, cost_calculator, processing

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


def _empty_summary_with_warning(message: str) -> dict:
    payload = cost_calculator._empty_summary()
    payload["period"] = "Insufficient data"
    payload["warning"] = message
    return payload


# ---------------------------------------------------------------------------
# GET /api/energy/summary — 7-day totals by state
# ---------------------------------------------------------------------------
@router.get("/energy/summary")
async def get_summary():
    """Return total 7-day energy cost and kWh broken down by operating state.

    On any failure or empty dataset, returns the empty-summary shape with a
    `warning` string set, status 200. Frontend treats this as a soft state.
    """
    try:
        raw = await historian_client.fetch_all_tags()
        df  = state_engine.build_dataframe(raw)
        if df.empty:
            return _empty_summary_with_warning("No data in the last 7 days")
        return cost_calculator.aggregate_summary(df)
    except Exception:
        logger.exception("summary aggregation failed")
        return _empty_summary_with_warning("Could not compute summary — see backend logs")


# ---------------------------------------------------------------------------
# GET /api/energy/daily — per-day breakdown
# ---------------------------------------------------------------------------
@router.get("/energy/daily")
async def get_daily():
    """Return daily energy cost segmented by state for the last 7 days.

    On any failure or empty dataset, returns an empty list, status 200.
    """
    try:
        raw = await historian_client.fetch_all_tags()
        df  = state_engine.build_dataframe(raw)
        if df.empty:
            return []
        return cost_calculator.aggregate_daily(df)
    except Exception:
        logger.exception("daily aggregation failed")
        return []


# ---------------------------------------------------------------------------
# GET /api/energy/timeline — last 24-hr minute-by-minute (from ring buffer)
# ---------------------------------------------------------------------------
@router.get("/energy/timeline")
async def get_timeline():
    """Return per-minute kW, state, and cost for the last 24 hours.

    Sourced from the in-memory ring buffer maintained by the processing loop.
    On a cold start the buffer fills up over time; clients should expect a
    growing series until 24h have elapsed since boot. On any failure or
    empty dataset, returns an empty list, status 200.
    """
    try:
        points = processing.timeline_points()
        if points:
            return points
        # Cold start fallback — read directly from the historian for the first tick.
        now   = datetime.now(timezone.utc)
        start = now - timedelta(hours=24)
        raw   = await historian_client.fetch_all_tags(start=start, end=now)
        df    = state_engine.build_dataframe(raw)
        if df.empty:
            return []
        return cost_calculator.aggregate_timeline(df)
    except Exception:
        logger.exception("timeline aggregation failed")
        return []


# ---------------------------------------------------------------------------
# GET /api/energy/current — live snapshot (from LatestState, no historian I/O)
# ---------------------------------------------------------------------------
@router.get("/energy/current")
async def get_current():
    """Return current motor amps, kW, live $/hr cost, TOU period, and shift.

    Reads from the in-memory LatestState populated by the processing loop —
    no historian round-trip on the request path.
    """
    return processing.current_metrics()


# ---------------------------------------------------------------------------
# GET /api/config — current settings
# ---------------------------------------------------------------------------
@router.get("/config")
async def get_config():
    """Return current electrical and rate configuration."""
    return cost_calculator.get_config()


# ---------------------------------------------------------------------------
# POST /api/config — update rate / electrical settings
# ---------------------------------------------------------------------------
@router.post("/config")
async def post_config(cfg: EnergyConfig):
    """Update $/kWh rate, voltage, or power factor."""
    cost_calculator.update_config(
        rate_per_kwh=cfg.rate_per_kwh,
        voltage=cfg.voltage,
        power_factor=cfg.power_factor,
    )
    return {"status": "ok", "config": cost_calculator.get_config()}


# ---------------------------------------------------------------------------
# GET /api/raw — debug endpoint: inspect raw tag data
# ---------------------------------------------------------------------------
@router.get("/raw", response_model=list[RawDebugResponse])
async def get_raw(hours: int = Query(default=1, ge=1, le=168)):
    """
    Debug endpoint — returns raw TVQ counts and first/last points per tag.
    Use hours param to control the lookback window (default: 1 hour).
    """
    now   = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)
    raw   = await historian_client.fetch_all_tags(start=start, end=now)

    result = []
    for alias, points in raw.items():
        result.append(RawDebugResponse(
            tag=alias,
            point_count=len(points),
            first=points[0] if points else None,
            last=points[-1] if points else None,
        ))
    return result
