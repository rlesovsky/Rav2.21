"""Value extraction layer — bridges the static i3X catalog (model.py) to
the live data sources (processing.LatestState / ring buffer for derived
signals, historian_client for raw passthrough tag history).

Routes import from here, not from processing/historian directly, so the
binding rules stay in one place.
"""

from datetime import datetime
from typing import Any, Optional

from services import historian_client, processing
from . import envelope, model


def _parse_iso(value: str) -> datetime:
    """Stdlib ISO parser. Python 3.11+ handles 'Z' suffix natively."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


# --- Current values (used by /objects/value) -------------------------------
def value_for_tag(element_id: str) -> Optional[dict]:
    """Return a VQT record for a tag's current value, or None if the tag
    isn't in our catalog. Caller wraps with per_element_success/error."""
    tag = model.TAG_LOOKUP.get(element_id)
    if tag is None:
        return None

    latest = processing.get_latest()
    field = tag["latest_field"]
    raw_value = getattr(latest, field, None)

    quality = envelope.quality_for_latest(
        latest_field_value=raw_value,
        is_stale=latest.is_stale,
        has_ever_been_good=latest.last_good_update is not None,
    )

    # The timestamp on a value should be the most recent moment the value
    # was actually known-good upstream — not the loop's last tick.
    ts = latest.last_good_update or latest.last_updated
    return envelope.vqt(value=raw_value, quality=quality, timestamp=ts)


# --- History (used by /objects/history) ------------------------------------
async def history_for_tag(
    element_id: str,
    start: datetime,
    end: datetime,
) -> Optional[list[dict]]:
    """Return a list of VQT records for a tag's history in the [start, end]
    window. Returns None if the tag isn't in the catalog. Empty list when
    the tag is known but has no points in the window."""
    tag = model.TAG_LOOKUP.get(element_id)
    if tag is None:
        return None

    if tag["is_passthrough"]:
        return await _passthrough_history(tag, start, end)
    return _derived_history(tag, start, end)


def _derived_history(tag: dict, start: datetime, end: datetime) -> list[dict]:
    """Source: processing.timeline_points() — the in-memory ring buffer
    populated by the Phase 2 processing loop and pre-filled at boot."""
    field = tag["latest_field"]
    points = processing.timeline_points()

    out: list[dict] = []
    for p in points:
        # timeline_points returns timestamps as ISO strings; parse for filter.
        ts_str = p.get("timestamp")
        if not ts_str:
            continue
        ts = _parse_iso(ts_str)
        if ts < start or ts > end:
            continue
        value = _extract_derived_value(p, field)
        out.append(envelope.vqt(value=value, quality=envelope.QUALITY_GOOD, timestamp=ts))
    return out


def _extract_derived_value(point: dict, field: str) -> Any:
    """Map a LatestState field name to the corresponding key in a
    timeline_points entry. The shapes diverge slightly: the buffer uses
    historian-style names (no `cost_per_hour`/`cost_today` since those
    aren't in the buffer), so we translate."""
    # Direct hits
    if field in ("state", "kw", "tou_period", "shift"):
        return point.get(field)
    # Derived but not in buffer — best-effort reconstruction from kw + tou_rate.
    # Buffer doesn't store cost_per_hour or cost_today directly because Phase 2
    # only writes minute-resolution snapshots that are about kW + classification.
    # For history of cost_per_hour: kw × tou_rate; for cost_today we don't have
    # historical accumulator state, so return None (consumers see GoodNoData).
    if field == "cost_per_hour":
        kw = point.get("kw")
        rate = point.get("tou_rate")
        if kw is not None and rate is not None:
            return round(kw * rate, 2)
        return None
    # cost_today is a stateful accumulator — historical values would require
    # snapshot-per-minute storage we don't currently keep. Return None until
    # we add that to the ring buffer.
    if field == "cost_today":
        return None
    # amps/running/cip aren't in the derived path (they'd be passthrough).
    return None


async def _passthrough_history(tag: dict, start: datetime, end: datetime) -> list[dict]:
    """Source: historian_client.fetch_tag_history — same path Phase 1 uses
    on the consumer side. Available for the full historian retention window."""
    historian_tag = tag["historian_tag"]
    try:
        # historian_client.fetch_tag_history is only exposed on the i3x_client
        # path (legacy client has different semantics). Use the active i3x
        # client directly to avoid the dispatcher's signature ambiguity.
        from services import i3x_client  # noqa: PLC0415 — lazy import is intentional
        raw_points = await i3x_client.fetch_tag_history(historian_tag, start, end)
    except Exception:
        return []

    out: list[dict] = []
    for p in raw_points:
        ts_str = p.get("t")
        if not ts_str:
            continue
        ts = _parse_iso(ts_str)
        out.append(envelope.vqt(value=p.get("v"), quality=envelope.QUALITY_GOOD, timestamp=ts))
    return out
