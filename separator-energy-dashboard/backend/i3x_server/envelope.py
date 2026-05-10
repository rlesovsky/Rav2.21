"""Wire-format helpers — every i3X response shape lives here.

Each helper emits the EXACT field set the api.i3x.dev/v1 reference server
returns, including required-but-null keys (``subscriptionId``, ``error``,
``components``). Centralizing this in one module means the routes never
forget a field and the test suite can pin shapes against the reference
captures in docs/phase3-producer-plan.md Appendix C.
"""

from datetime import datetime, timezone
from typing import Any, Optional


# --- Top-level envelopes ----------------------------------------------------
def unary_success(result: Any) -> dict:
    """For /info, /namespaces, /objects, /objecttypes, /relationshiptypes."""
    return {"success": True, "result": result}


def bulk_success(items: list[dict]) -> dict:
    """For /objects/list, /objects/value, /objects/history. Note `results`
    has an `s` (matches reference server)."""
    return {"success": True, "results": items}


# --- Per-element wrappers (used inside bulk_success) -----------------------
def per_element_success(element_id: str, result: dict) -> dict:
    return {
        "success":        True,
        "elementId":      element_id,
        "subscriptionId": None,
        "result":         result,
        "error":          None,
    }


def per_element_error(element_id: str, code: str, message: str) -> dict:
    return {
        "success":        False,
        "elementId":      element_id,
        "subscriptionId": None,
        "result":         None,
        "error":          {"code": code, "message": message},
    }


# --- Value / history record shapes ----------------------------------------
def vqt(value: Any, quality: str, timestamp: datetime) -> dict:
    """Reference VQT: value-quality-timestamp record. Includes the
    isComposition/components keys the reference always emits (null for
    leaf tags)."""
    return {
        "isComposition": False,
        "value":         value,
        "quality":       quality,
        "timestamp":     _iso_seconds(timestamp),
        "components":    None,
    }


def history_result(values: list[dict]) -> dict:
    """The `result` field of a /history per-element entry — a wrapper
    around the values list that mirrors the reference shape."""
    return {
        "isComposition": False,
        "values":        values,
    }


# --- Quality classification -------------------------------------------------
QUALITY_GOOD = "Good"
QUALITY_BAD = "Bad"
QUALITY_UNCERTAIN = "Uncertain"
QUALITY_GOOD_NO_DATA = "GoodNoData"


def quality_for_latest(latest_field_value: Any, is_stale: bool, has_ever_been_good: bool) -> str:
    """Quality string based on processing.LatestState semantics:

    - Good       — fresh and we've seen at least one good upstream tick
    - Uncertain  — value present but stale (upstream silent recently)
    - Bad        — never received a good upstream value
    - GoodNoData — value is None but quality machinery is fine (rare)
    """
    if not has_ever_been_good:
        return QUALITY_BAD
    if latest_field_value is None:
        return QUALITY_GOOD_NO_DATA
    if is_stale:
        return QUALITY_UNCERTAIN
    return QUALITY_GOOD


# --- Timestamp formatting ---------------------------------------------------
def _iso_seconds(dt: Optional[datetime]) -> str:
    """Format like the reference server: second precision, UTC, Z suffix."""
    if dt is None:
        return ""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
