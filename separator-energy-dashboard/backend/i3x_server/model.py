"""i3X producer object model — static catalog.

Defines the namespaces, object types, relationship types, folders, and
tags that Rav2.21 publishes via the i3X server. Computed once at import
time; everything is plain dicts and lists so the routes layer can return
slices directly.

ElementId convention: slug-style (e.g. ``separator-1-kw``) to match the
api.i3x.dev/v1 reference server. The hierarchy is preserved via
``parentId``, not via the elementId string itself.

Each tag carries internal binding metadata (``latest_field``,
``is_passthrough``, ``historian_tag``, ``value_type``) that the values
layer uses to fetch from ``processing.LatestState`` / ``processing``
ring buffer / ``historian_client``. The public ObjectInstance shape
strips those out — see ``public_object_instance``.
"""

from typing import Any, Optional

# --- Namespace -------------------------------------------------------------
NAMESPACE_URI = "https://rav221.tse.prod/separator-energy"
NAMESPACE_DISPLAY = "Separator Energy"

NAMESPACES = [
    {"uri": NAMESPACE_URI, "displayName": NAMESPACE_DISPLAY},
]

# --- Object types -----------------------------------------------------------
TYPE_FOLDER = "folder-type"
TYPE_TAG = "tag-type"

OBJECT_TYPES = [
    {
        "elementId":     TYPE_FOLDER,
        "displayName":   "Folder",
        "namespaceUri":  NAMESPACE_URI,
        "sourceTypeId":  "Folder",
        "version":       None,
        "schema": {
            "type": "object",
            "description": "Organizational container for navigating the catalog.",
        },
        "related": {
            "relationshipType": "HasComponent",
            "types": [f"{NAMESPACE_URI}:{TYPE_TAG}", f"{NAMESPACE_URI}:{TYPE_FOLDER}"],
        },
    },
    {
        "elementId":     TYPE_TAG,
        "displayName":   "Tag",
        "namespaceUri":  NAMESPACE_URI,
        "sourceTypeId":  "Tag",
        "version":       None,
        "schema": {
            "type": "object",
            "description": "Single-value tag carrying a current value, quality, and timestamp.",
            "properties": {
                "value":     {"type": ["number", "string", "boolean", "null"]},
                "quality":   {"type": "string", "enum": ["Good", "Bad", "Uncertain", "GoodNoData"]},
                "timestamp": {"type": "string", "format": "date-time"},
            },
            "required": ["value", "quality", "timestamp"],
        },
    },
]

# --- Relationship types -----------------------------------------------------
REL_HAS_COMPONENT = "HasComponent"
REL_HAS_PARENT = "HasParent"

RELATIONSHIP_TYPES = [
    {
        "elementId":     REL_HAS_COMPONENT,
        "displayName":   "HasComponent",
        "namespaceUri":  NAMESPACE_URI,
        "description":   "Parent has a child component (folder contains tag, etc.)",
    },
    {
        "elementId":     REL_HAS_PARENT,
        "displayName":   "HasParent",
        "namespaceUri":  NAMESPACE_URI,
        "description":   "Child references its parent (inverse of HasComponent)",
    },
]

# --- Folders ---------------------------------------------------------------
# Mirrors the UNS topic path on the MQTT broker:
#   Driftwood Dairy / El Monte CA / Raw Side / Seperator / 1 / Edge
# Raw passthrough tags hang off Edge (matching MQTT); Rav2.21-derived signals
# hang off Energy (a sibling that has no MQTT analog).
F_ROOT   = "driftwood-dairy"
F_SITE   = "driftwood-dairy-el-monte"
F_AREA   = "el-monte-raw-side"
F_CLASS  = "el-monte-raw-side-separator"
F_UNIT   = "separator-1"
F_EDGE   = "separator-1-edge"
F_ENERGY = "separator-1-energy"

FOLDERS = [
    {
        "elementId":     F_ROOT,
        "displayName":   "Driftwood Dairy",
        "typeElementId": TYPE_FOLDER,
        "parentId":      None,
        "isComposition": False,
        "isExtended":    False,
    },
    {
        "elementId":     F_SITE,
        "displayName":   "El Monte, CA",
        "typeElementId": TYPE_FOLDER,
        "parentId":      F_ROOT,
        "isComposition": False,
        "isExtended":    False,
    },
    {
        "elementId":     F_AREA,
        "displayName":   "Raw Side",
        "typeElementId": TYPE_FOLDER,
        "parentId":      F_SITE,
        "isComposition": False,
        "isExtended":    False,
    },
    {
        "elementId":     F_CLASS,
        "displayName":   "Separator",
        "typeElementId": TYPE_FOLDER,
        "parentId":      F_AREA,
        "isComposition": False,
        "isExtended":    False,
    },
    {
        "elementId":     F_UNIT,
        "displayName":   "1",
        "typeElementId": TYPE_FOLDER,
        "parentId":      F_CLASS,
        "isComposition": False,
        "isExtended":    False,
    },
    {
        "elementId":     F_EDGE,
        "displayName":   "Edge",
        "typeElementId": TYPE_FOLDER,
        "parentId":      F_UNIT,
        "isComposition": False,
        "isExtended":    False,
    },
    {
        "elementId":     F_ENERGY,
        "displayName":   "Energy",
        "typeElementId": TYPE_FOLDER,
        "parentId":      F_UNIT,
        "isComposition": False,
        "isExtended":    False,
    },
]

# --- Tags ------------------------------------------------------------------
# Each tag definition includes:
#   - public ObjectInstance fields (elementId, displayName, typeElementId, etc.)
#   - internal binding metadata for the values layer:
#       * latest_field    — attribute name on processing.LatestState
#       * value_type      — "number" | "string" | "boolean"
#       * is_passthrough  — True for raw upstream tags (motor_amps, running, cip);
#                           historian fetches their history (>24h available)
#       * historian_tag   — the logical tag key used by historian_client
#                           (only set when is_passthrough is True)
#       * description     — human-readable explainer

def _tag(element_id, display_name, parent_id, latest_field, value_type,
         description, is_passthrough=False, historian_tag=None):
    return {
        "elementId":     element_id,
        "displayName":   display_name,
        "typeElementId": TYPE_TAG,
        "parentId":      parent_id,
        "isComposition": False,
        "isExtended":    False,
        # internal — stripped from public responses
        "latest_field":   latest_field,
        "value_type":     value_type,
        "is_passthrough": is_passthrough,
        "historian_tag":  historian_tag,
        "description":    description,
    }


TAGS = [
    # Derived signals — sourced from processing.LatestState / ring buffer.
    # Grouped under F_ENERGY (no MQTT analog; computed by Rav2.21).
    _tag("separator-1-state",         "Operating state",         F_ENERGY,
         latest_field="state", value_type="string",
         description="Processing | CIP | Idle | Shutdown — classified from upstream booleans"),
    _tag("separator-1-kw",            "Power draw",              F_ENERGY,
         latest_field="kw", value_type="number",
         description="kW = (motor amps × 460V × √3 × 0.88 PF) / 1000"),
    _tag("separator-1-cost-per-hour", "Cost per hour",           F_ENERGY,
         latest_field="cost_per_hour", value_type="number",
         description="USD/h = kW × current SCE TOU rate"),
    _tag("separator-1-cost-today",    "Cost today",              F_ENERGY,
         latest_field="cost_today", value_type="number",
         description="Cumulative USD since local midnight (US/Pacific). Resets at facility-local midnight."),
    _tag("separator-1-tou-period",    "TOU period",              F_ENERGY,
         latest_field="tou_period", value_type="string",
         description="On-Peak | Mid-Peak | Off-Peak | Super Off-Peak (SCE TOU-GS-2)"),
    _tag("separator-1-shift",         "Shift",                   F_ENERGY,
         latest_field="shift", value_type="string",
         description="1st (06–14) | 2nd (14–22) | 3rd (22–06) Pacific"),

    # Passthrough — raw upstream tags. Grouped under F_EDGE to mirror the
    # MQTT path .../Seperator/1/Edge/{Motor Amps, Running, CIP}. /value reads
    # from LatestState; /history falls back to historian_client because the
    # ring buffer doesn't store raw tags individually.
    _tag("separator-1-motor-amps",    "Motor amps",              F_EDGE,
         latest_field="amps", value_type="number",
         is_passthrough=True, historian_tag="motor_amps",
         description="Motor current in amps — passthrough from upstream historian"),
    _tag("separator-1-running",       "Running",                 F_EDGE,
         latest_field="running", value_type="boolean",
         is_passthrough=True, historian_tag="running",
         description="Motor running flag — passthrough from upstream historian"),
    _tag("separator-1-cip",           "CIP",                     F_EDGE,
         latest_field="cip", value_type="boolean",
         is_passthrough=True, historian_tag="cip",
         description="Clean-in-place active flag — passthrough from upstream historian"),
]

# --- Lookups ---------------------------------------------------------------
ALL_OBJECTS = FOLDERS + TAGS
ELEMENT_LOOKUP: dict[str, dict] = {obj["elementId"]: obj for obj in ALL_OBJECTS}
TAG_LOOKUP:     dict[str, dict] = {t["elementId"]: t for t in TAGS}
FOLDER_LOOKUP:  dict[str, dict] = {f["elementId"]: f for f in FOLDERS}

# Pre-compute child relationships for /objects/related.
CHILDREN: dict[str, list[str]] = {}
for obj in ALL_OBJECTS:
    pid = obj["parentId"]
    if pid is not None:
        CHILDREN.setdefault(pid, []).append(obj["elementId"])


# --- Public ObjectInstance projection --------------------------------------
PUBLIC_FIELDS = ("elementId", "displayName", "typeElementId", "parentId",
                 "isComposition", "isExtended")


def public_object_instance(obj: dict) -> dict:
    """Strip internal binding metadata; return only the fields the reference
    server emits in ObjectInstance responses."""
    return {k: obj[k] for k in PUBLIC_FIELDS}


def get_object(element_id: str) -> Optional[dict]:
    """Lookup helper — returns the FULL dict (including internal metadata)
    or None if not in the catalog."""
    return ELEMENT_LOOKUP.get(element_id)


def is_tag(element_id: str) -> bool:
    return element_id in TAG_LOOKUP


def get_children(element_id: str) -> list[str]:
    return CHILDREN.get(element_id, [])
