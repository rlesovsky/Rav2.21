"""Analytical-window cache + pre-warm loop.

Both the public /api/energy/{summary,daily} endpoints AND a periodic
background task call into get_summary() / get_daily() here. First request
for a given (days, offset) tuple computes from scratch (historian fetch +
pandas aggregation, slow); subsequent calls within TTL serve from memory.

The pre-warm loop keeps the four common windows hot at all times so the
first user click after a cold boot is fast — not a one-minute wait.

Concurrency: each cache key has its own asyncio.Lock so that if two requests
for the same window arrive while it's being computed, only one historian
fetch happens; the second awaits the same result.
"""

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional

from services import cost_calculator, historian_client, state_engine

logger = logging.getLogger(__name__)

# 5-minute TTL — analytical data is rolling; users tolerate 5-minute staleness
# in exchange for sub-second response. Pre-warm runs every 4 minutes so the
# cache is always under TTL when the next refresh fires.
TTL_SECONDS = 300
PREWARM_INTERVAL_SECONDS = 240

# (days, offset) tuples to pre-warm. Mirrors the windows the frontend asks
# for: current 7d, prior 7d, current 30d, prior 30d.
PREWARM_WINDOWS: tuple[tuple[int, int], ...] = (
    (7, 0), (7, 7),
    (30, 0), (30, 30),
)

_cache: dict[tuple, dict] = {}
_locks: dict[tuple, asyncio.Lock] = {}
_prewarm_task: Optional[asyncio.Task] = None


# --- public API used by routers and lifespan --------------------------------
async def get_summary(days: int, offset: int) -> dict:
    return await _get_or_compute(
        ("summary", days, offset),
        lambda: _compute_summary(days, offset),
    )


async def get_daily(days: int, offset: int) -> list[dict]:
    return await _get_or_compute(
        ("daily", days, offset),
        lambda: _compute_daily(days, offset),
    )


def clear_cache() -> None:
    _cache.clear()


async def start_prewarm() -> None:
    global _prewarm_task
    if _prewarm_task is not None and not _prewarm_task.done():
        return
    _prewarm_task = asyncio.create_task(_prewarm_loop(), name="analytics-prewarm")
    logger.info(
        "analytics prewarm started (interval=%ss, windows=%s)",
        PREWARM_INTERVAL_SECONDS,
        list(PREWARM_WINDOWS),
    )


async def stop_prewarm() -> None:
    global _prewarm_task
    if _prewarm_task is None:
        return
    _prewarm_task.cancel()
    try:
        await _prewarm_task
    except asyncio.CancelledError:
        pass
    _prewarm_task = None
    logger.info("analytics prewarm stopped")


# --- internals --------------------------------------------------------------
async def _get_or_compute(
    key: tuple,
    compute_fn: Callable[[], Awaitable[Any]],
) -> Any:
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit["t"] < TTL_SECONDS:
        return hit["v"]

    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        # Re-check after acquiring — another coroutine may have just filled it.
        hit = _cache.get(key)
        if hit and time.time() - hit["t"] < TTL_SECONDS:
            return hit["v"]
        started = time.time()
        value = await compute_fn()
        elapsed = time.time() - started
        _cache[key] = {"t": time.time(), "v": value}
        if elapsed > 1.0:
            logger.info("analytics computed %s in %.1fs", key, elapsed)
        return value


async def _compute_summary(days: int, offset: int) -> dict:
    df = await _build_df(days, offset)
    return cost_calculator.aggregate_summary(df)


async def _compute_daily(days: int, offset: int) -> list[dict]:
    df = await _build_df(days, offset)
    return cost_calculator.aggregate_daily(df)


async def _build_df(days: int, offset: int):
    end = datetime.now(timezone.utc) - timedelta(days=offset)
    start = end - timedelta(days=days)
    raw = await historian_client.fetch_all_tags(start=start, end=end)
    return state_engine.build_dataframe(raw)


async def _prewarm_window(days: int, offset: int) -> None:
    """Build the dataframe ONCE and populate both summary + daily caches.

    Bypasses get_or_compute's per-key locking because we want to fold both
    aggregations into a single historian round-trip. Halves the prewarm
    work compared to calling get_summary() + get_daily() naively.
    """
    df = await _build_df(days, offset)
    summary = cost_calculator.aggregate_summary(df)
    daily = cost_calculator.aggregate_daily(df)
    now = time.time()
    _cache[("summary", days, offset)] = {"t": now, "v": summary}
    _cache[("daily", days, offset)] = {"t": now, "v": daily}


async def _prewarm_loop() -> None:
    # Wait for app fully online before first prewarm run.
    await asyncio.sleep(8)
    while True:
        try:
            started = time.time()
            # Run windows in parallel — 4 concurrent historian fetches let the
            # 30-day work overlap with the 7-day work, dropping wall-clock by
            # roughly half.
            await asyncio.gather(
                *[_prewarm_window(d, o) for d, o in PREWARM_WINDOWS]
            )
            logger.info(
                "analytics prewarm: refreshed %d windows in %.1fs (cache size=%d)",
                len(PREWARM_WINDOWS),
                time.time() - started,
                len(_cache),
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("analytics prewarm error")
        await asyncio.sleep(PREWARM_INTERVAL_SECONDS)
