"""i3X consumer client for the Timebase historian.

Public surface (preserves the legacy contract — see docs/i3x-integration.md §8):

    fetch_current_values() -> dict[str, float|bool|None]
    fetch_all_tags(start, end) -> dict[str, list[{t,v,q}]]
    fetch_tag_history(tag_path, start, end) -> list[{t,v,q}]
    startup()  / shutdown()
    get_info() -- diagnostic only (Timebase returns 404 here in practice)

This client targets Timebase's i3X-flavored API as observed against the live
historian — NOT the CESMII 1.0-Beta spec. Three concrete shape facts:

  * /value and /history return a flat dict keyed by elementId, not the
    spec's {success, results: [...]} bulk wrapper.
  * /objects/list returns the spec-compliant array of ObjectInstance dicts.
    (Timebase is mixed: dict-keyed for time-series reads, array for browse.)
  * Quality is the literal string "GOOD" (uppercase), not Pascal-case "Good".

These are not historical curiosities; they are the wire format. The CESMII
1.0-Beta spec is reference for terminology only.

Deliberate operational deviation — boundary clamping (NOT filtering)
--------------------------------------------------------------------
When upstream is sparse or stale, Timebase returns the most-recent point
*outside* the requested window as forward-fill seed data. We clamp such
points' timestamps to startTime instead of filtering them out — otherwise
state_engine.build_dataframe sees an empty series and the dashboard goes
blank exactly when staleness most needs to be visible.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from config import (
    I3X_BASE_URL,
    I3X_DATASET,
    I3X_TAGS,
    I3X_TIMEOUT_SECONDS,
    LOOKBACK_DAYS,
)

logger = logging.getLogger(__name__)

GOOD_QUALITY = "GOOD"
GOOD_QUALITY_INT = 192

_client: Optional[httpx.AsyncClient] = None


# --- ElementId construction -------------------------------------------------
def build_tag_element_id(dataset: str, base_path: str, tag_name: str) -> str:
    return f"{dataset}:{base_path}/{tag_name}"


# --- HTTP client lifecycle --------------------------------------------------
async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=I3X_BASE_URL,
            timeout=I3X_TIMEOUT_SECONDS,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


# --- Startup validation -----------------------------------------------------
async def startup() -> None:
    """Validate every configured elementId via POST /i3x/objects/list.

    No /i3x/info probe — Timebase returns 404 there, and a noisy mandatory
    404 at boot conditions ops to ignore startup errors. The /objects/list
    validation is the real functional check.

    Fails loud if any configured tag is missing or has an error entry.
    """
    client = await get_client()
    await _validate_element_ids(client, list(I3X_TAGS.values()))
    logger.info("i3X startup: validated %d configured tags", len(I3X_TAGS))


async def shutdown() -> None:
    await close_client()


# --- Diagnostic /info wrapper -----------------------------------------------
async def get_info() -> tuple[Optional[dict], int]:
    """Probe upstream /i3x/info on demand. Returns (payload_or_None, status_code).

    Never raises — the endpoint that calls this surfaces the status verbatim
    so ops can see "configured but upstream doesn't expose /info" (404) vs.
    "configured but upstream unreachable" (0) vs. "ok" (200) without 502s.
    """
    client = await get_client()
    try:
        resp = await client.get("/i3x/info")
    except httpx.RequestError as exc:
        logger.warning("i3X /info network error: %s", exc)
        return None, 0

    if resp.status_code != 200:
        return None, resp.status_code

    try:
        payload = resp.json()
    except (ValueError, TypeError) as exc:  # JSON parse error
        logger.warning("i3X /info returned 200 with unparseable body: %s", exc)
        return None, resp.status_code

    if isinstance(payload, dict) and isinstance(payload.get("result"), dict):
        return payload["result"], resp.status_code
    return (payload if isinstance(payload, dict) else {}), resp.status_code


# --- Internal helpers --------------------------------------------------------
async def _validate_element_ids(client: httpx.AsyncClient, element_ids: list[str]) -> None:
    """POST /i3x/objects/list and confirm every elementId resolves cleanly.

    Timebase returns the spec-shape array here — a top-level list of
    ObjectInstance dicts, each carrying its own "elementId" field. We also
    accept the dict-keyed shape used elsewhere on this API (defensive: future
    Timebase versions or other i3X servers may differ) and fail loudly only
    when an elementId is genuinely missing or has an error entry.
    """
    body = {"elementIds": element_ids}
    try:
        payload = await _post("/i3x/objects/list", body, client)
    except (httpx.HTTPError, RuntimeError) as exc:
        raise RuntimeError(
            f"i3X /objects/list validation failed at {I3X_BASE_URL}: {exc}"
        ) from exc

    missing: list[str] = []

    if isinstance(payload, list):
        # Spec shape: array of ObjectInstance dicts.
        present = {
            item["elementId"]
            for item in payload
            if isinstance(item, dict) and "elementId" in item and not item.get("error")
        }
        missing = [eid for eid in element_ids if eid not in present]
    elif isinstance(payload, dict):
        # Timebase shape: dict keyed by elementId.
        for eid in element_ids:
            entry = payload.get(eid)
            if not isinstance(entry, dict) or entry.get("error"):
                missing.append(eid)
    else:
        raise RuntimeError(
            f"i3X /objects/list returned unexpected shape: {type(payload).__name__}"
        )

    if missing:
        logger.error(
            "i3X startup validation failed for dataset %r — missing/invalid elementIds: %s",
            I3X_DATASET,
            missing,
        )
        raise RuntimeError(
            f"i3X startup validation failed for dataset '{I3X_DATASET}'. "
            f"Missing or invalid elementIds: {missing}"
        )


async def _post(path: str, payload: dict, client: httpx.AsyncClient) -> Any:
    resp = await client.post(path, json=payload)
    if resp.status_code == 206:
        logger.warning("i3X %s returned 206 Partial Content — result truncated", path)
    resp.raise_for_status()
    body = resp.json()
    # A successful bulk response may include per-tag {"error": ...} entries
    # alongside its "data" keys; that's not a request-level failure. Only raise
    # when the body itself is a top-level error (no "data" anywhere).
    if isinstance(body, dict) and body.get("error") and "data" not in body:
        raise RuntimeError(f"i3X error for {path}: {body.get('error')}")
    return body


def _is_good_quality(q: Any) -> bool:
    """Strict match: only the literal uppercase string 'GOOD' passes.

    Tolerance here would hide upstream changes — if Timebase ever starts
    emitting 'Good' or 'good', we want to know about it loudly, not coerce
    it silently into our pipeline.
    """
    return q == GOOD_QUALITY


def _iso_utc(value: datetime) -> str:
    """Emit ISO 8601 UTC with millisecond precision and a 'Z' suffix.

    Matches Timebase's wire format and avoids silently rounding sub-second
    timestamps in clamped boundary points.
    """
    return (
        value.astimezone(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _normalize_bool(value: object) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(int(value))
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "on", "yes"}:
            return True
        if lowered in {"0", "false", "off", "no"}:
            return False
    return bool(value)


def _to_contract_point(point: dict, start: Optional[datetime] = None) -> Optional[dict]:
    """Convert a Timebase VQT to legacy {t, v, q}, applying boundary clamp."""
    if not _is_good_quality(point.get("quality")):
        return None
    timestamp = point.get("timestamp")
    if not timestamp:
        return None

    dt = _parse_iso(str(timestamp))
    # Boundary clamp — Timebase staleness compensation; see module docstring.
    if start is not None and dt < start:
        dt = start

    return {
        "t": _iso_utc(dt),
        "v": point.get("value"),
        "q": GOOD_QUALITY_INT,
    }


def _extract_value_results(payload: Any, requested_ids: list[str]) -> dict[str, list[dict]]:
    """Pull per-elementId VQT lists from the Timebase dict-keyed response shape:

        {"<elementId>": {"data": [{value, quality, timestamp}, ...]}}

    For invalid elementIds, the entry contains an `error` field instead of
    `data`. We log and treat the tag as having zero points.

    Caller is responsible for quality filtering and timestamp clamping via
    _to_contract_point.
    """
    out: dict[str, list[dict]] = {eid: [] for eid in requested_ids}
    if not isinstance(payload, dict):
        return out

    for eid in requested_ids:
        entry = payload.get(eid)
        if not isinstance(entry, dict):
            continue
        if entry.get("error"):
            logger.error("i3X per-tag error for %s: %s", eid, entry.get("error"))
            continue
        data = entry.get("data")
        if isinstance(data, list):
            out[eid] = [p for p in data if isinstance(p, dict)]
    return out


# --- Public API --------------------------------------------------------------
async def fetch_tag_history(
    tag_path: str,
    start: datetime,
    end: datetime,
) -> list[dict]:
    element_id = I3X_TAGS.get(tag_path)
    if element_id is None:
        raise KeyError(f"Unknown tag path: {tag_path}")

    client = await get_client()
    request = {
        "elementIds": [element_id],
        "startTime": _iso_utc(start),
        "endTime": _iso_utc(end),
    }

    try:
        body = await _post("/i3x/objects/history", request, client)
    except (httpx.HTTPError, RuntimeError, ValueError) as exc:
        logger.error("i3X history error for %s: %s", element_id, exc)
        return []

    raw_points = _extract_value_results(body, [element_id]).get(element_id, [])

    normalized: list[dict] = []
    for point in raw_points:
        mapped = _to_contract_point(point, start=start)
        if mapped is not None:
            normalized.append(mapped)
    normalized.sort(key=lambda p: p["t"])
    return normalized


async def fetch_all_tags(
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> dict[str, list[dict]]:
    """Single bulk /history request for all four tags."""
    now = datetime.now(timezone.utc)
    if end is None:
        end = now
    if start is None:
        start = now - timedelta(days=LOOKBACK_DAYS)

    aliases = list(I3X_TAGS.keys())
    element_ids = [I3X_TAGS[a] for a in aliases]

    request = {
        "elementIds": element_ids,
        "startTime": _iso_utc(start),
        "endTime": _iso_utc(end),
    }

    client = await get_client()
    try:
        body = await _post("/i3x/objects/history", request, client)
    except (httpx.HTTPError, RuntimeError, ValueError) as exc:
        logger.error("i3X bulk history failed: %s", exc)
        return {alias: [] for alias in aliases}

    per_id = _extract_value_results(body, element_ids)

    out: dict[str, list[dict]] = {}
    for alias in aliases:
        eid = I3X_TAGS[alias]
        normalized: list[dict] = []
        for point in per_id.get(eid, []):
            mapped = _to_contract_point(point, start=start)
            if mapped is not None:
                normalized.append(mapped)
        normalized.sort(key=lambda p: p["t"])
        out[alias] = normalized
        logger.debug("i3X bulk history: alias=%s good=%d", alias, len(normalized))
    return out


async def fetch_current_values() -> dict[str, float | bool | None]:
    aliases = list(I3X_TAGS.keys())
    element_ids = [I3X_TAGS[a] for a in aliases]
    request = {"elementIds": element_ids}

    client = await get_client()
    try:
        body = await _post("/i3x/objects/value", request, client)
    except (httpx.HTTPError, RuntimeError, ValueError) as exc:
        logger.error("i3X value fetch failed: %s", exc)
        return {alias: None for alias in aliases}

    per_id = _extract_value_results(body, element_ids)

    current: dict[str, float | bool | None] = {}
    for alias in aliases:
        eid = I3X_TAGS[alias]
        points = per_id.get(eid, [])
        first = points[0] if points else None
        if not isinstance(first, dict) or not _is_good_quality(first.get("quality")):
            current[alias] = None
            continue
        value = first.get("value")
        if alias in {"running", "cip", "process"}:
            current[alias] = _normalize_bool(value)
        else:
            current[alias] = value
    return current
