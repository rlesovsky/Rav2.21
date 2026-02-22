# =============================================================================
# routers/energy.py — FastAPI Route Handlers
# =============================================================================

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Query

from models.schemas import (
    EnergySummary, DailyRecord, TimelinePoint,
    CurrentMetrics, EnergyConfig, RawDebugResponse,
)
from services import timebase_client, state_engine, cost_calculator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# GET /api/energy/summary — 7-day totals by state
# ---------------------------------------------------------------------------
@router.get("/energy/summary", response_model=EnergySummary)
async def get_summary():
    """Return total 7-day energy cost and kWh broken down by operating state."""
    raw = await timebase_client.fetch_all_tags()
    df  = state_engine.build_dataframe(raw)
    return cost_calculator.aggregate_summary(df)


# ---------------------------------------------------------------------------
# GET /api/energy/daily — per-day breakdown
# ---------------------------------------------------------------------------
@router.get("/energy/daily", response_model=list[DailyRecord])
async def get_daily():
    """Return daily energy cost segmented by state for the last 7 days."""
    raw = await timebase_client.fetch_all_tags()
    df  = state_engine.build_dataframe(raw)
    return cost_calculator.aggregate_daily(df)


# ---------------------------------------------------------------------------
# GET /api/energy/timeline — last 24-hr minute-by-minute
# ---------------------------------------------------------------------------
@router.get("/energy/timeline", response_model=list[TimelinePoint])
async def get_timeline():
    """Return per-minute kW, state, and cost for the last 24 hours."""
    now   = datetime.now(timezone.utc)
    start = now - timedelta(hours=24)
    raw   = await timebase_client.fetch_all_tags(start=start, end=now)
    df    = state_engine.build_dataframe(raw)
    return cost_calculator.aggregate_timeline(df)


# ---------------------------------------------------------------------------
# GET /api/energy/current — live snapshot
# ---------------------------------------------------------------------------
@router.get("/energy/current", response_model=CurrentMetrics)
async def get_current():
    """Return current motor amps, kW, live $/hr cost, TOU period, and shift."""
    values = await timebase_client.fetch_current_values()
    now = datetime.now(timezone.utc)

    amps  = values.get("motor_amps")
    state = state_engine.classify_state(
        process=bool(values.get("process") or False),
        cip=bool(values.get("cip") or False),
        running=bool(values.get("running") or False),
    )
    tou_period = cost_calculator.get_tou_period(now)
    tou_rate   = cost_calculator.get_tou_rate(now)
    shift      = cost_calculator.get_shift(now)
    return cost_calculator.current_cost(amps, state, tou_period=tou_period, tou_rate=tou_rate, shift=shift)


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
    raw   = await timebase_client.fetch_all_tags(start=start, end=now)

    result = []
    for alias, points in raw.items():
        result.append(RawDebugResponse(
            tag=alias,
            point_count=len(points),
            first=points[0] if points else None,
            last=points[-1] if points else None,
        ))
    return result
