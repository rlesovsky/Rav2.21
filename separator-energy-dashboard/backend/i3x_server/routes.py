"""i3X producer FastAPI router — mounted at /api/i3x/v1 in main.py.

Every endpoint matches the api.i3x.dev/v1 reference server's wire shape.
Routes are deliberately thin — they translate request bodies, dispatch
to model.py / values.py, and wrap with envelope.py helpers. No data
logic lives here.

Spec deviations from naive reading of github.com/cesmii/i3X — all
verified against live reference-server captures (see
docs/phase3-producer-plan.md Appendix C):

  - Per-element bulk results carry `subscriptionId` and `error` (null when unused)
  - VQTs carry `isComposition` and `components` (false / null for leaf tags)
  - ObjectInstance uses `typeElementId`, NOT `typeId`
  - History `result` wraps values in `{isComposition, values}`, not bare list
  - /objects/list with empty elementIds returns 422
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from . import envelope, model, values


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))

router = APIRouter(prefix="/api/i3x/v1", tags=["i3x-producer"])


# --- Request bodies --------------------------------------------------------
class ElementIdsBody(BaseModel):
    elementIds: list[str] = Field(..., min_length=1)

    @field_validator("elementIds")
    @classmethod
    def _non_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("'elementIds' must contain at least one element")
        return v


class HistoryBody(ElementIdsBody):
    startTime: str
    endTime: str


class RelatedBody(BaseModel):
    elementId: str
    relationshipType: Optional[str] = None


# --- Landing page (not in spec, UX nicety) ---------------------------------
# A bare GET on /api/i3x/v1 returns a small map of available endpoints, so
# anyone curling/browsing the prefix gets something useful instead of 404.
# i3X-aware clients (ACE Explorer, MCP tools) ignore this and call /info
# directly per spec.
@router.get("")
@router.get("/")
async def index() -> dict:
    return {
        "message":     "Rav2.21 i3X server. Use the endpoints below or point an i3X-aware client (e.g. ACE Explorer) at this base URL.",
        "specVersion": "1.0",
        "serverName":  "Rav2.21 - Driftwood Separator Energy",
        "endpoints": {
            "info":              "GET  /api/i3x/v1/info",
            "namespaces":        "GET  /api/i3x/v1/namespaces",
            "objecttypes":       "GET  /api/i3x/v1/objecttypes",
            "relationshiptypes": "GET  /api/i3x/v1/relationshiptypes",
            "objects":           "GET  /api/i3x/v1/objects",
            "objects_list":      "POST /api/i3x/v1/objects/list      body={elementIds:[...]}",
            "objects_related":   "POST /api/i3x/v1/objects/related   body={elementId, relationshipType?}",
            "objects_value":     "POST /api/i3x/v1/objects/value     body={elementIds:[...]}",
            "objects_history":   "POST /api/i3x/v1/objects/history   body={elementIds:[...], startTime, endTime}",
        },
        "explorer": "https://github.com/cesmii/i3X-explorer",
    }


# --- /info ------------------------------------------------------------------
@router.get("/info")
async def get_info() -> dict:
    """Server identity and capabilities. Static."""
    return envelope.unary_success({
        "specVersion":   "1.0",
        "serverVersion": "beta",
        "serverName":    "Rav2.21 - Driftwood Separator Energy",
        "capabilities": {
            "query":     {"history": True},
            "update":    {"current": False, "history": False},
            "subscribe": {"stream": False},
        },
    })


# --- /namespaces ------------------------------------------------------------
@router.get("/namespaces")
async def get_namespaces() -> dict:
    return envelope.unary_success(model.NAMESPACES)


# --- /objecttypes -----------------------------------------------------------
@router.get("/objecttypes")
async def get_objecttypes() -> dict:
    return envelope.unary_success(model.OBJECT_TYPES)


@router.post("/objecttypes/query")
async def query_objecttypes() -> dict:
    """Reference server accepts query bodies; we ignore filters in v1 and
    return everything. Filter support is a follow-up."""
    return envelope.unary_success(model.OBJECT_TYPES)


# --- /relationshiptypes -----------------------------------------------------
@router.get("/relationshiptypes")
async def get_relationshiptypes() -> dict:
    return envelope.unary_success(model.RELATIONSHIP_TYPES)


@router.post("/relationshiptypes/query")
async def query_relationshiptypes() -> dict:
    return envelope.unary_success(model.RELATIONSHIP_TYPES)


# --- /objects (browse + lookup + related) ----------------------------------
@router.get("/objects")
async def get_objects() -> dict:
    """Full catalog — every folder + tag in the published tree."""
    return envelope.unary_success([
        model.public_object_instance(obj) for obj in model.ALL_OBJECTS
    ])


@router.post("/objects/list")
async def list_objects(body: ElementIdsBody) -> dict:
    """Lookup by elementId. Bulk wrapper; per-element error for unknown IDs."""
    items = []
    for eid in body.elementIds:
        obj = model.get_object(eid)
        if obj is None:
            items.append(envelope.per_element_error(eid, "NotFound", "elementId not found"))
        else:
            items.append(envelope.per_element_success(eid, model.public_object_instance(obj)))
    return envelope.bulk_success(items)


@router.post("/objects/related")
async def get_related(body: RelatedBody) -> dict:
    """Return objects related to the given elementId.

    For HasComponent (the only relationship we publish), this is the
    parent's children. If a relationshipType is provided and we don't
    publish it, return an empty list rather than an error — matches
    reference server tolerance."""
    if model.get_object(body.elementId) is None:
        return envelope.bulk_success([
            envelope.per_element_error(body.elementId, "NotFound", "elementId not found"),
        ])

    if body.relationshipType not in (None, model.REL_HAS_COMPONENT):
        # Unknown relationship — return empty success
        return envelope.bulk_success([
            envelope.per_element_success(body.elementId, {"related": []}),
        ])

    child_ids = model.get_children(body.elementId)
    related = [
        model.public_object_instance(model.ELEMENT_LOOKUP[cid])
        for cid in child_ids
    ]
    return envelope.bulk_success([
        envelope.per_element_success(body.elementId, {"related": related}),
    ])


# --- /objects/value ---------------------------------------------------------
@router.post("/objects/value")
async def get_values(body: ElementIdsBody) -> dict:
    """Current values. Reads from processing.LatestState — no historian
    round-trip on the request path."""
    items = []
    for eid in body.elementIds:
        if not model.is_tag(eid):
            items.append(envelope.per_element_error(eid, "NotFound", "elementId not found"))
            continue
        vqt = values.value_for_tag(eid)
        if vqt is None:
            items.append(envelope.per_element_error(eid, "NotFound", "elementId not found"))
        else:
            items.append(envelope.per_element_success(eid, vqt))
    return envelope.bulk_success(items)


# --- /objects/history -------------------------------------------------------
@router.post("/objects/history")
async def get_history(body: HistoryBody) -> dict:
    """Time-series reads. Derived signals from the 24h ring buffer;
    raw passthrough tags from the historian."""
    try:
        start = _parse_iso(body.startTime)
        end = _parse_iso(body.endTime)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=f"invalid time format: {exc}")

    if start > end:
        raise HTTPException(status_code=400, detail="startTime must be <= endTime")

    items = []
    for eid in body.elementIds:
        if not model.is_tag(eid):
            items.append(envelope.per_element_error(eid, "NotFound", "elementId not found"))
            continue
        vqt_list = await values.history_for_tag(eid, start, end)
        items.append(envelope.per_element_success(eid, envelope.history_result(vqt_list or [])))
    return envelope.bulk_success(items)
