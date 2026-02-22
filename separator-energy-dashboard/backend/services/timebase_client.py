# =============================================================================
# services/timebase_client.py — TimeBase REST API Client
# Driftwood Dairy | Texas Automation Systems
#
# TimeBase REST API reference:
#   GET /api/datasets/{dataset}/data
#     ?tagname={tag}
#     &start={ISO or relative}
#     &end={ISO or relative}
#
# Response shape:
#   {
#     "s": "start_ISO",
#     "e": "end_ISO",
#     "tl": [
#       { "t": { "n": "tagname", ... }, "d": [ { "t": "timestamp_ISO", "v": value, "q": quality_int }, ... ] }
#     ]
#   }
# =============================================================================

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx

from config import (
    TIMEBASE_BASE_URL,
    TIMEBASE_DATASET,
    TAGS,
    LOOKBACK_DAYS,
    MIN_GOOD_QUALITY,
)

logger = logging.getLogger(__name__)


def _encode_dataset(name: str) -> str:
    """URL-encode the dataset name (handles spaces and leading underscores)."""
    return quote(name, safe="")


def _build_url() -> str:
    """Build the TimeBase REST base URL (without query params)."""
    dataset_enc = _encode_dataset(TIMEBASE_DATASET)
    return f"{TIMEBASE_BASE_URL}/api/datasets/{dataset_enc}/data"


async def fetch_tag_history(
    tag_path: str,
    start: datetime,
    end: datetime,
    client: httpx.AsyncClient,
) -> list[dict]:
    """
    Fetch raw TVQ history for a single tag from TimeBase.

    Args:
        tag_path: Full UNS tag path string
        start:    Start datetime (UTC)
        end:      End datetime (UTC)
        client:   Shared httpx.AsyncClient

    Returns:
        List of dicts: [{"t": ISO_str, "v": value, "q": quality_int}, ...]
        Returns empty list on error — never raises.
    """
    url = _build_url()
    params = {
        "tagname": tag_path,
        "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end":   end.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    try:
        response = await client.get(url, params=params, timeout=30.0)
        response.raise_for_status()
        payload = response.json()
        tl = payload.get("tl", [])
        raw_points = tl[0]["d"] if tl else []

        # Filter out bad quality points
        good_points = [
            p for p in raw_points
            if p.get("q", 0) >= MIN_GOOD_QUALITY
        ]

        logger.info(
            "TimeBase: tag=%s  total=%d  good=%d  window=%s→%s",
            tag_path.split("/")[-1],
            len(raw_points),
            len(good_points),
            params["start"],
            params["end"],
        )
        return good_points

    except httpx.HTTPStatusError as e:
        logger.error("TimeBase HTTP error %s for tag %s: %s", e.response.status_code, tag_path, e)
        return []
    except httpx.RequestError as e:
        logger.error("TimeBase connection error for tag %s: %s", tag_path, e)
        return []
    except Exception as e:
        logger.error("Unexpected error fetching tag %s: %s", tag_path, e)
        return []


async def fetch_all_tags(
    start: datetime | None = None,
    end: datetime | None = None,
) -> dict[str, list[dict]]:
    """
    Fetch all 6 separator tags in parallel for the given time window.

    Args:
        start: Start datetime UTC (default: now - LOOKBACK_DAYS)
        end:   End datetime UTC (default: now)

    Returns:
        Dict keyed by tag alias: {"motor_amps": [...], "running": [...], ...}
    """
    now = datetime.now(timezone.utc)
    if end is None:
        end = now
    if start is None:
        start = now - timedelta(days=LOOKBACK_DAYS)

    async with httpx.AsyncClient() as client:
        tasks = {
            alias: fetch_tag_history(path, start, end, client)
            for alias, path in TAGS.items()
        }
        results = await asyncio.gather(*tasks.values(), return_exceptions=False)

    return dict(zip(tasks.keys(), results))


async def fetch_current_values() -> dict[str, float | bool | None]:
    """
    Fetch the latest value for each tag (last 2 minutes window).

    Returns:
        Dict of {alias: latest_value} — value is None if no recent data.
    """
    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=2)

    raw = await fetch_all_tags(start=start, end=now)

    current = {}
    for alias, points in raw.items():
        if points:
            latest = max(points, key=lambda p: p["t"])
            current[alias] = latest["v"]
        else:
            current[alias] = None

    return current
