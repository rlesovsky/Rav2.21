"""Continuous processing service (Phase 2).

A single asyncio task runs forever, ticking every PROCESSING_INTERVAL_SECONDS:

  fetch upstream tag values
    -> classify operating state
    -> compute kW, $/hr, $/today, TOU period, shift
    -> write to LatestState
    -> append a minute-resolution sample to the ring buffer

The dashboard endpoints and (later) the i3X producer read from LatestState
and the ring buffer instead of round-tripping to the historian on every
request.

Concurrency model: single producer (the loop), many readers (request
handlers). LatestState is replaced atomically; the deque is thread-safe for
append/iter at the GIL level.
"""

import asyncio
import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

import pandas as pd

from config import (
    FACILITY_TIMEZONE,
    PROCESSING_BUFFER_MINUTES,
    PROCESSING_INTERVAL_SECONDS,
    STALE_THRESHOLD_SECONDS,
)
from services import cost_calculator, historian_client, state_engine

logger = logging.getLogger(__name__)


@dataclass
class LatestState:
    # Inputs (passthrough from upstream)
    amps:          Optional[float] = None
    running:       Optional[bool]  = None
    cip:           Optional[bool]  = None
    process:       Optional[bool]  = None
    # Derived
    state:         str   = state_engine.STATE_SHUTDOWN
    color:         str   = state_engine.STATE_COLORS[state_engine.STATE_SHUTDOWN]
    kw:            Optional[float] = None
    cost_per_hour: Optional[float] = None
    cost_today:    float = 0.0
    tou_period:    str   = "Off-Peak"
    tou_rate:      float = 0.0
    shift:         str   = "Unknown"
    # Health
    last_updated:      Optional[datetime] = None  # last successful tick (any outcome)
    last_good_update:  Optional[datetime] = None  # last tick with at least one GOOD value
    is_stale:          bool = True


# --- Module-level singletons ------------------------------------------------
_latest: LatestState = LatestState()
_buffer: deque = deque(maxlen=PROCESSING_BUFFER_MINUTES)
_task: Optional[asyncio.Task] = None
_last_buffer_minute: Optional[datetime] = None
_cost_today_local_date = None  # facility-local date for the active cost_today bucket


# --- Public accessors -------------------------------------------------------
def get_latest() -> LatestState:
    return _latest


def current_metrics() -> dict:
    """Return a CurrentMetrics-shaped dict from LatestState."""
    s = _latest
    return {
        "amps":          round(s.amps, 1) if s.amps is not None else None,
        "kw":            s.kw,
        "cost_per_hour": s.cost_per_hour,
        "state":         s.state,
        "color":         s.color,
        "tou_period":    s.tou_period,
        "tou_rate":      round(s.tou_rate, 4) if s.tou_rate else 0.0,
        "shift":         s.shift,
        "cost_today":    round(s.cost_today, 4),
        "last_updated":  s.last_updated.strftime("%Y-%m-%dT%H:%M:%SZ") if s.last_updated else None,
        "is_stale":      s.is_stale,
    }


def timeline_points() -> list[dict]:
    """Return ring-buffer samples as TimelinePoint-shaped dicts (oldest first)."""
    out: list[dict] = []
    for ts, sample in list(_buffer):
        kw = sample.get("kw") or 0.0
        kwh = round(kw / 60.0, 4)  # 1-minute interval
        rate = sample.get("tou_rate") or 0.0
        out.append({
            "timestamp":  ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "kw":         round(kw, 2),
            "kwh":        kwh,
            "cost_usd":   round(kwh * rate, 4),
            "state":      sample.get("state", state_engine.STATE_SHUTDOWN),
            "color":      sample.get("color", "#000000"),
            "tou_period": sample.get("tou_period", "Off-Peak"),
            "tou_rate":   round(rate, 4),
            "shift":      sample.get("shift", "Unknown"),
        })
    return out


def buffer_size() -> int:
    return len(_buffer)


# --- Loop internals (visible for testing) -----------------------------------
async def _tick() -> None:
    """Run one iteration of the processing loop. Safe to call directly in tests."""
    global _last_buffer_minute, _cost_today_local_date

    now_utc = datetime.now(timezone.utc)
    facility_tz = ZoneInfo(FACILITY_TIMEZONE)
    now_local_date = now_utc.astimezone(facility_tz).date()

    # Reset cost_today on local-midnight rollover.
    if _cost_today_local_date != now_local_date:
        _cost_today_local_date = now_local_date
        _latest.cost_today = 0.0

    try:
        values = await historian_client.fetch_current_values()
    except Exception as exc:
        # Retain last good state, just mark stale and bump last_updated.
        logger.error("processing tick: fetch_current_values failed: %s", exc)
        _latest.last_updated = now_utc
        _latest.is_stale = True
        return

    amps    = values.get("motor_amps")
    running = values.get("running")
    cip     = values.get("cip")
    process = values.get("process")

    has_good = any(v is not None for v in (amps, running, cip, process))

    state = state_engine.classify_state(
        process=bool(process or False),
        cip=bool(cip or False),
        running=bool(running or False),
    )
    tou_period = cost_calculator.get_tou_period(now_utc)
    tou_rate   = cost_calculator.get_tou_rate(now_utc)
    shift      = cost_calculator.get_shift(now_utc)
    metrics    = cost_calculator.current_cost(
        amps, state, tou_period=tou_period, tou_rate=tou_rate, shift=shift,
    )

    kw            = metrics.get("kw")
    cost_per_hour = metrics.get("cost_per_hour")

    # Accumulate cost_today using the actual elapsed time since the previous
    # successful tick. Clamp huge gaps so a long pause can't blow up the bucket.
    if _latest.last_updated is not None and kw is not None:
        elapsed = (now_utc - _latest.last_updated).total_seconds()
        elapsed = max(0.0, min(elapsed, PROCESSING_INTERVAL_SECONDS * 6))
        _latest.cost_today += kw * (elapsed / 3600.0) * (tou_rate or 0.0)

    _latest.amps          = amps
    _latest.running       = running
    _latest.cip           = cip
    _latest.process       = process
    _latest.state         = state
    _latest.color         = metrics.get("color", state_engine.STATE_COLORS.get(state, "#000000"))
    _latest.kw            = kw
    _latest.cost_per_hour = cost_per_hour
    _latest.tou_period    = tou_period
    _latest.tou_rate      = tou_rate or 0.0
    _latest.shift         = shift
    _latest.last_updated  = now_utc
    if has_good:
        _latest.last_good_update = now_utc

    if _latest.last_good_update is None:
        _latest.is_stale = True
    else:
        age = (now_utc - _latest.last_good_update).total_seconds()
        _latest.is_stale = age > STALE_THRESHOLD_SECONDS

    minute_key = now_utc.replace(second=0, microsecond=0)
    if _last_buffer_minute != minute_key:
        _buffer.append((minute_key, {
            "state":      _latest.state,
            "color":      _latest.color,
            "kw":         kw,
            "tou_period": tou_period,
            "tou_rate":   tou_rate,
            "shift":      shift,
        }))
        _last_buffer_minute = minute_key


async def _loop() -> None:
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("processing loop tick raised")
        await asyncio.sleep(PROCESSING_INTERVAL_SECONDS)


# --- Lifecycle --------------------------------------------------------------
async def _backfill_buffer() -> None:
    """Pre-populate the ring buffer with the last PROCESSING_BUFFER_MINUTES
    from the historian.

    Without this, after a restart the buffer starts empty and the timeline
    chart shows only the minutes that have ticked since boot — claiming
    "24 hour" while displaying 5 minutes of data. The backfill blocks startup
    by ~2-5s but guarantees the live tab has a full 24h chart immediately.
    """
    global _last_buffer_minute
    if len(_buffer) > 0:
        return  # already populated (e.g., test or hot-reload)

    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=PROCESSING_BUFFER_MINUTES)

    try:
        raw = await historian_client.fetch_all_tags(start=start, end=now)
        df = state_engine.build_dataframe(raw)
    except Exception as exc:
        logger.warning(
            "processing backfill: historian fetch failed (%s); buffer will fill from live ticks",
            exc,
        )
        return

    if df.empty:
        logger.info("processing backfill: historian returned no data")
        return

    df = cost_calculator.calculate_costs(df)

    appended = 0
    for ts, row in df.iterrows():
        kw_raw = row.get("kw")
        if pd.isna(kw_raw):
            continue
        minute_key = ts.to_pydatetime()
        if minute_key.tzinfo is None:
            minute_key = minute_key.replace(tzinfo=timezone.utc)
        minute_key = minute_key.replace(second=0, microsecond=0)
        state = row.get("state", state_engine.STATE_SHUTDOWN)
        _buffer.append((minute_key, {
            "state":      state,
            "color":      state_engine.STATE_COLORS.get(state, "#000000"),
            "kw":         float(kw_raw),
            "tou_period": row.get("tou_period", "Off-Peak"),
            "tou_rate":   float(row.get("tou_rate", 0.0)),
            "shift":      row.get("shift", "Unknown"),
        }))
        appended += 1

    if _buffer:
        _last_buffer_minute = _buffer[-1][0]

    logger.info("processing backfill: pre-populated %d minutes from historian", appended)


async def start() -> None:
    global _task
    if _task is not None and not _task.done():
        return
    # Backfill the ring buffer first so the live tab shows a real 24h
    # window the moment the dashboard loads, not a slowly-growing series.
    await _backfill_buffer()
    _task = asyncio.create_task(_loop(), name="processing-loop")
    logger.info(
        "processing loop started (interval=%ss, buffer=%dm, stale_after=%ss)",
        PROCESSING_INTERVAL_SECONDS, PROCESSING_BUFFER_MINUTES, STALE_THRESHOLD_SECONDS,
    )


async def stop() -> None:
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    _task = None
    logger.info("processing loop stopped")


# --- Test hook --------------------------------------------------------------
def _reset_for_tests() -> None:
    """Reset module state — only for use from unit tests."""
    global _latest, _buffer, _last_buffer_minute, _cost_today_local_date, _task
    _latest = LatestState()
    _buffer = deque(maxlen=PROCESSING_BUFFER_MINUTES)
    _last_buffer_minute = None
    _cost_today_local_date = None
    _task = None
