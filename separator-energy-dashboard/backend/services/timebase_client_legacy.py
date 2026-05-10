import asyncio
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx

from config import (
    LOOKBACK_DAYS,
    MIN_GOOD_QUALITY,
    TAGS,
    TIMEBASE_BASE_URL,
    TIMEBASE_DATASET,
)

logger = logging.getLogger(__name__)


def _encode_dataset(name: str) -> str:
    return quote(name, safe="")


def _build_url() -> str:
    dataset_enc = _encode_dataset(TIMEBASE_DATASET)
    return f"{TIMEBASE_BASE_URL}/api/datasets/{dataset_enc}/data"


async def validate_configuration() -> None:
    """Legacy client has no startup validation endpoint."""
    return None


async def fetch_tag_history(
    tag_path: str,
    start: datetime,
    end: datetime,
    client: httpx.AsyncClient,
) -> list[dict]:
    url = _build_url()
    params = {
        "tagname": tag_path,
        "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    try:
        response = await client.get(url, params=params, timeout=30.0)
        response.raise_for_status()
        payload = response.json()
        tl = payload.get("tl", [])
        raw_points = tl[0]["d"] if tl else []

        good_points = [p for p in raw_points if p.get("q", 0) >= MIN_GOOD_QUALITY]

        logger.info(
            "TimeBase legacy: tag=%s total=%d good=%d window=%s->%s",
            tag_path.split("/")[-1],
            len(raw_points),
            len(good_points),
            params["start"],
            params["end"],
        )
        return good_points
    except httpx.HTTPStatusError as exc:
        logger.error(
            "TimeBase legacy HTTP error %s for tag %s: %s",
            exc.response.status_code,
            tag_path,
            exc,
        )
        return []
    except httpx.RequestError as exc:
        logger.error("TimeBase legacy connection error for tag %s: %s", tag_path, exc)
        return []
    except Exception as exc:
        logger.error("TimeBase legacy unexpected error fetching tag %s: %s", tag_path, exc)
        return []


async def fetch_all_tags(
    start: datetime | None = None,
    end: datetime | None = None,
) -> dict[str, list[dict]]:
    now = datetime.now(timezone.utc)
    if end is None:
        end = now
    if start is None:
        start = now - timedelta(days=LOOKBACK_DAYS)

    async with httpx.AsyncClient() as client:
        tasks = {
            alias: fetch_tag_history(path, start, end, client) for alias, path in TAGS.items()
        }
        results = await asyncio.gather(*tasks.values(), return_exceptions=False)

    return dict(zip(tasks.keys(), results))


async def fetch_current_values() -> dict[str, float | bool | None]:
    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=2)

    raw = await fetch_all_tags(start=start, end=now)

    current: dict[str, float | bool | None] = {}
    for alias, points in raw.items():
        if points:
            latest = max(points, key=lambda point: point["t"])
            current[alias] = latest["v"]
        else:
            current[alias] = None

    return current
