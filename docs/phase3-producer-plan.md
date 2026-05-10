# Phase 3 — i3X Producer Implementation Plan

**Status:** Planning. Phases 1 and 2 shipped on `feat/i3x-consumer-client`.
**Goal:** Make Rav2.21 a 1.0-compliant i3X server so other applications
(Grafana, MES, AI agents, Claude Desktop / MCP clients, ACE i3X Explorer)
can browse, read, and subscribe to its derived energy signals.
**Pairs with:** [`docs/i3x-integration.md`](./i3x-integration.md) §3–§5 and
[`docs/phase1-shipped.md`](./phase1-shipped.md).

> **Build target — reference server, not abstract docs.**
> The CESMII reference implementation is live at `https://api.i3x.dev/v1`
> (ThinkIQ-hosted). Real clients pattern-match on its exact wire shape;
> any spec interpretation that diverges from it will fail interop. **All
> endpoint shapes in this doc are taken from live captures of that server
> on 2026-05-10** — see Appendix C. If the spec docs disagree with the
> reference server, build to the server and file a spec issue.
>
> Two concrete deltas from naive spec reading:
>
> - Base path is `/v1/*`, not `/i3x/*`. (Our consumer uses `/i3x/` because
>   that's what Timebase publishes; the producer follows the reference.)
> - `specVersion: "1.0"` and `serverVersion: "beta"` are separate fields
>   in `/info`, not the combined `"1.0-Beta"` string.

---

## 1. Why this matters

Today the dashboard's derived signals (operating state, kW, $/hr, $/today,
TOU period, shift) live and die inside FastAPI request handlers. The only
consumer is the React frontend.

Once the dashboard publishes those signals as an i3X server, **any** i3X
client can subscribe to them. The work makes Rav2.21 the canonical source
for "everything about Separator 1's energy story" — the upstream historian
has the raw tags; we add the cost / state / TOU layer that turns those
tags into operational meaning.

Concrete near-term consumers:

- **MaestroHub Contextualize layer** consuming derived signals as part of
  the plant data graph
- **Grafana / Prometheus dashboards** at the corporate level pulling cost
  metrics across plants
- **AI agents (Claude / MCP)** answering "what's the separator costing
  right now?" without needing to compute kW from amps themselves
- **MES / ERP** ingesting per-shift cost into production records

---

## 2. What "fully compliant" means

Target: match the **`https://api.i3x.dev/v1`** reference implementation
(spec 1.0, server beta).

### Endpoints the reference server exposes

Verified live on 2026-05-10. See Appendix C for raw payloads.

| Endpoint | Required for v1? | Notes |
|---|---|---|
| `GET /v1/info` | ✅ | Server identity + capabilities |
| `GET /v1/namespaces` | ✅ | List published namespaces |
| `GET /v1/objecttypes` + `POST /v1/objecttypes/query` | ✅ | Type definitions; types carry JSON Schema describing their data shape |
| `GET /v1/relationshiptypes` + `POST /v1/relationshiptypes/query` | ✅ | Relationship type defs |
| `GET /v1/objects` | ✅ | Full catalog browse |
| `POST /v1/objects/list` | ✅ | Lookup by elementId. **Rejects empty `elementIds` with HTTP 422** |
| `POST /v1/objects/related` | ✅ | Relationship traversal |
| `POST /v1/objects/value` | ✅ | Current value reads (and writes via `update.current` capability) |
| `POST /v1/objects/history` | ✅ | Time-series reads |
| `POST /v1/subscriptions` (stream only) | Phase 4 (optional v1) | Reference server only advertises `subscribe.stream` (SSE), not sync poll |

**v1 of Phase 3 ships everything except subscriptions.** Subscriptions
are valuable but a fully-async lifecycle is its own engineering effort
(see §9). Polling clients work fine without them.

### Capabilities object — what to advertise in `/info`

The reference server's capability map is sparser than I'd assumed; match it:

```json
"capabilities": {
  "query":     { "history": true },
  "update":    { "current": false, "history": false },
  "subscribe": { "stream": false }
}
```

- `query.history` is the only `query` flag the reference server uses;
  value/list/related are assumed available if the server is up at all.
- `update.{current,history}` are write capabilities. **Decide explicitly
  whether Rav2.21 accepts writes** — recommend `false` for both in v1
  (Rav2.21's signals are computed, not user-settable). Spec issue if a
  client tries to write.
- `subscribe.stream` flips to `true` when Phase 4 ships.

### Spec-purity vs the consumer-side pragma

Our consumer client (`backend/services/i3x_client.py`) deliberately does
NOT match the reference shape — it speaks Timebase's pre-1.0 dialect
because that's what the historian actually emits. **The producer does
the opposite: it matches the reference server byte-for-byte**, because
downstream clients will pattern-match on it.

Concrete shape details to honor on the producer side (verified live):

1. **Bulk envelope** for `/value`, `/history`, `/objects/list`:
   `{"success": true, "results": [{"success": true, "elementId": "...", "subscriptionId": null, "result": {...}, "error": null}]}`
   Note: `subscriptionId` and `error` keys are present (null when unused).
2. **Unary envelope** for `/info`, `/namespaces`, `/objects`, `/objecttypes`:
   `{"success": true, "result": ...}` — no per-element wrapping.
3. **Quality strings are Pascal-case**: `Good`, `Bad`, `Uncertain`, `GoodNoData` (confirmed from live `/value` capture).
4. **ISO 8601 timestamps with `Z` suffix**: reference server uses second precision (`2026-05-10T22:26:41Z`); ms precision is not required and our consumer handles either, so emit second precision to match.
5. **VQT records include `isComposition` and `components`:** for hierarchical objects the value can be a composition of child values; leaf tags use `{"isComposition": false, "components": null, "value": ..., "quality": "...", "timestamp": "..."}`.
6. **ObjectInstance fields:** `elementId`, `displayName`, `typeElementId` (NOT `typeId`), `parentId` (nullable), `isComposition`, `isExtended`. **No `hasChildren` or `namespaceUri` per object** — those live on the type/namespace.

The architecture doc §3 said "Phase 3 producer will be 1.0-Beta-compliant.
That is the right place to be spec-pure because we control the wire
shape Rav2.21 publishes." Reference server is now the source of truth
for what "compliant" means.

---

## 3. Published object model

The architecture doc §4 specified path-based elementIds
(`Separator Energy:Driftwood Dairy/El Monte CA/Separator/1/kw`). The
reference server uses **dash-slug elementIds**
(`pump-101-measurements-bearing-temperature-value`). **Decide which
before building** — see §11 open question #1.

Both options below; pick one and commit.

### Option A — slug-style (matches reference server convention)

```
namespaceUri: https://rav221.tse.prod/separator-energy
displayName:  Separator Energy

# Folders
driftwood-dairy
driftwood-dairy-el-monte
driftwood-dairy-el-monte-separator-1

# Tags (children of driftwood-dairy-el-monte-separator-1)
driftwood-separator-1-state
driftwood-separator-1-kw
driftwood-separator-1-cost-per-hour
driftwood-separator-1-cost-today
driftwood-separator-1-tou-period
driftwood-separator-1-shift
driftwood-separator-1-motor-amps
driftwood-separator-1-running
driftwood-separator-1-cip
```

Pros: matches reference server exactly. Easier interop with clients
written against `api.i3x.dev/v1`. Shorter ids, URL-safe, no special
characters.
Cons: less human-readable than path-based; harder to scan in a list.

### Option B — path-based (architecture doc §4)

```
namespaceUri: https://rav221.tse.prod/separator-energy

# Folders
Separator Energy:Driftwood Dairy
Separator Energy:Driftwood Dairy/El Monte CA
Separator Energy:Driftwood Dairy/El Monte CA/Separator
Separator Energy:Driftwood Dairy/El Monte CA/Separator/1

# Tags
Separator Energy:Driftwood Dairy/El Monte CA/Separator/1/state
Separator Energy:Driftwood Dairy/El Monte CA/Separator/1/kw
... etc
```

Pros: human-readable; matches Timebase's convention so the consumer-side
mental model carries over.
Cons: spaces and slashes in elementIds (works but unusual); no live
reference server uses this style — interop is on a hope.

**Recommendation: Option A.** Match the reference. Hierarchy is preserved
via `parentId` regardless of elementId format, so the visual browse is
the same in any client.

### Tags published under `Separator/1` (object model unchanged either way)

The corrections vs the upstream historian:
- "Separator" not "Seperator" (we fix the typo on republish)
- No "Raw Side" segment (OT-edge artifact, not load-bearing)
- No "Edge" segment

| Tag | Schema (JSON Schema-style) | uom | Description |
|---|---|---|---|
| `state` | `{"type": "string"}` | — | Processing \| CIP \| Idle \| Shutdown |
| `kw` | `{"type": "number"}` | kW | Live power draw |
| `cost_per_hour` | `{"type": "number"}` | USD/h | Live $/hr at current TOU rate |
| `cost_today` | `{"type": "number"}` | USD | Cumulative cost since local midnight (US/Pacific) |
| `tou_period` | `{"type": "string"}` | — | On-Peak \| Mid-Peak \| Off-Peak \| Super Off-Peak |
| `shift` | `{"type": "string"}` | — | 1st \| 2nd \| 3rd |
| `motor_amps` | `{"type": "number"}` | A | Passthrough from upstream Edge gateway |
| `running` | `{"type": "boolean"}` | — | Passthrough |
| `cip` | `{"type": "boolean"}` | — | Passthrough |

### ObjectType strategy

Two further decisions on type system (see §11 question #2):

- **A: Define a custom type** `dairy-separator-type` in our own
  namespace with the above tags as a JSON Schema. Simple, self-contained.
- **B: Re-use ISA-95 types** from the reference server's namespaces
  (`https://isa.org/isa95:work-unit-type`, plus
  `https://abelara.com/equipment:state-type` and similar). More
  industry-standard but pulls in a dependency on those namespaces.

Recommendation: **A for v1** (custom type, our namespace). B is more
correct industrially but adds scope. ISA-95 alignment can be a follow-up.

We expose passthrough tags too because consumers shouldn't need *both*
this server and the upstream historian. Rav2.21 becomes the single
canonical source.

---

## 4. What's already in place

Phase 2 set up the data source the producer needs. **No additional state
management is needed for value reads or 24h history reads:**

| Data need | Already provided by |
|---|---|
| Current `state`, `kw`, `cost_per_hour`, `cost_today`, `tou_period`, `shift`, `motor_amps`, `running`, `cip` | `processing.get_latest()` returns `LatestState` |
| Last 24 hours of any of the above at 1-minute resolution | `processing.timeline_points()` returns the ring buffer |
| Boot-time backfill so the buffer always has 24h | Already in `processing.start()` (Phase 2 work) |

For history queries **older than 24h**: the ring buffer doesn't go that far
back. Two options (decide before building):

- **Option A — passthrough to historian for raw tags only.** `motor_amps`,
  `running`, `cip` queries go straight through to Timebase. Derived signals
  (`state`, `kw`, etc.) are only available for the last 24h. Simple.
- **Option B — persistent buffer.** Write the ring buffer's evictions to
  disk (SQLite, parquet, or just JSONL) so derived history extends as
  long as we want. More work but cleaner story.

Recommend **Option A for v1**. If a real client asks for >24h derived
history, do Option B as a separate task.

---

## 5. New code structure

```
backend/i3x_server/                       NEW package
├── __init__.py
├── model.py            # static catalog: namespaces, types, folders, tags
├── envelope.py         # spec-compliant response wrappers
├── routes.py           # FastAPI APIRouter with all /i3x/* endpoints
└── tests/
    ├── test_envelope.py
    ├── test_routes.py
    └── test_model.py

backend/main.py         # mount i3x_server.router at /api/i3x/*
docs/phase3-shipped.md  # NEW (analog to phase1-shipped.md)
docs/i3x-integration.md # update §5 Phase 3 status to "shipped"
```

`backend/i3x_server/` is a self-contained package because the i3X server
is logically separate from the dashboard's REST API. Keeps the FastAPI
app modular if we ever pull the producer out into its own service.

---

## 6. Endpoint-by-endpoint plan

For each endpoint: response shape, source data, edge cases.

All paths under `/api/i3x/v1/*` (we mount the reference's `/v1` namespace
under our existing `/api/i3x/` prefix to keep our routes scoped).

### `GET /api/i3x/v1/info`

Returns server identity and capabilities. Match the reference server's
field names exactly:

```json
{
  "success": true,
  "result": {
    "specVersion": "1.0",
    "serverVersion": "beta",
    "serverName": "Rav2.21 — Driftwood Separator Energy",
    "capabilities": {
      "query":     { "history": true },
      "update":    { "current": false, "history": false },
      "subscribe": { "stream": false }
    }
  }
}
```

`subscribe.stream` flips to `true` when Phase 4 ships.

### `GET /api/i3x/v1/namespaces`

```json
{
  "success": true,
  "result": [
    {
      "uri": "https://rav221.tse.prod/separator-energy",
      "displayName": "Separator Energy"
    }
  ]
}
```

Note: `displayName` not `name`. Single namespace today; future
multi-separator deployments would extend.

### `GET /api/i3x/v1/objecttypes` + `POST /api/i3x/v1/objecttypes/query`

Returns the `dairy-separator-type` definition (or whichever type system
we choose per §3). Type definitions on the reference server include a
JSON Schema describing the data shape and a `related` block describing
relationships to other types. Static — doesn't change at runtime;
computed once at startup from `i3x_server/model.py`.

Reference shape:
```json
{
  "elementId": "dairy-separator-type",
  "displayName": "DairySeparatorType",
  "namespaceUri": "https://rav221.tse.prod/separator-energy",
  "sourceTypeId": "DairySeparatorType",
  "version": null,
  "schema": { "type": "object", "properties": { ... } },
  "related": { "relationshipType": "HasComponent", "types": [...] }
}
```

### `GET /api/i3x/v1/objects` and `POST /api/i3x/v1/objects/list`

Returns ObjectInstance dicts for the catalog (3 folders + 9 tags = 12
objects under our chosen elementId scheme). Each entry has the fields the
reference server emits — and only those:

```json
{
  "elementId": "driftwood-separator-1-kw",
  "displayName": "Driftwood Separator 1 — kW",
  "typeElementId": "measurement-value-type",
  "parentId": "driftwood-dairy-el-monte-separator-1",
  "isComposition": false,
  "isExtended": false
}
```

**No `hasChildren`, no `namespaceUri` per object** — those live on
`/objecttypes` and `/namespaces` respectively. **No `typeId` — it's
`typeElementId`.**

`POST /v1/objects/list` rejects empty `elementIds` arrays with HTTP 422
(reference server validates this with Pydantic; we should match).

### `POST /api/i3x/v1/objects/related`

Folder → child relationships. Static traversal of the catalog using the
relationship types defined in `/relationshiptypes`.

### `POST /api/i3x/v1/objects/value`

The hot path. Match the reference server's per-element shape exactly,
including the `subscriptionId`, `error`, `isComposition`, and `components`
keys (some are `null` for our use case but must be present):

```jsonc
{
  "success": true,
  "results": [
    {
      "success": true,
      "elementId": "driftwood-separator-1-kw",
      "subscriptionId": null,
      "result": {
        "isComposition": false,
        "value": 33.6,
        "quality": "Good",
        "timestamp": "2026-05-10T22:14:33Z",
        "components": null
      },
      "error": null
    }
  ]
}
```

**Source:** `processing.get_latest()` for all tags. Build a
`tagId -> (value, timestamp, quality)` map at request time:

- `state`, `kw`, `cost_per_hour`, `cost_today`, `tou_period`, `shift`,
  `motor_amps`, `running`, `cip` → all from LatestState fields
- `quality`: `Good` if `LatestState.is_stale` is False; `Uncertain` if
  stale; `Bad` if `last_good_update` is None (never had data)
- `timestamp`: `LatestState.last_updated` formatted as
  `YYYY-MM-DDTHH:MM:SSZ` (second precision; ms not required by reference)

For unknown elementIds:
```jsonc
{
  "success": false,
  "elementId": "unknown-tag",
  "subscriptionId": null,
  "result": null,
  "error": { "code": "NotFound", "message": "elementId not found" }
}
```

(Verify exact `error` shape against a reference-server miss before
shipping; the captures we have don't include an error case.)

**Latency target:** <50ms (no historian round-trip — pure in-memory read).

### `POST /api/i3x/v1/objects/history`

```jsonc
{
  "success": true,
  "results": [
    {
      "success": true,
      "elementId": "driftwood-separator-1-kw",
      "subscriptionId": null,
      "result": {
        "isComposition": false,
        "values": [
          {
            "isComposition": false,
            "value": 33.5,
            "quality": "Good",
            "timestamp": "2026-05-10T18:00:00Z",
            "components": null
          },
          ...
        ]
      },
      "error": null
    }
  ]
}
```

Note: `result.values` (the array of VQTs), inside which each VQT also
carries `isComposition`/`components`. Empty windows return
`{"isComposition": false, "values": []}` — NOT a 4xx, NOT a per-element
`error`.

**Source for derived signals (state, kw, $/hr, etc.):**
`processing.timeline_points()` — filtered to the requested
`[startTime, endTime]` window. If window > 24h: return only what the
buffer has.

**Source for passthrough tags (motor_amps, running, cip):** historian via
existing `historian_client.fetch_tag_history()`. They're available all the
way back.

**Window validation:** reject `startTime > endTime` with 400. Cap the
maximum window length (e.g., 7 days) to prevent runaway queries.

### `POST /api/i3x/v1/subscriptions/*` (Phase 4 — defer)

See §9. Reference server only advertises `subscribe.stream` (SSE), not
sync poll. Plan to ship just SSE in Phase 4.

---

## 7. Wire-format envelope module

`backend/i3x_server/envelope.py` centralizes reference-server compliance.
Every key the reference returns must be present (even when `null`), so
helpers default `subscriptionId`/`error`/`components` rather than letting
callers forget:

```python
from datetime import datetime, timezone

def unary_success(result):
    """Used for /info, /namespaces, /objects, /objecttypes."""
    return {"success": True, "result": result}

def bulk_success(items: list[dict]) -> dict:
    """Used for /objects/list, /objects/value, /objects/history.
    Note the `results` key has an `s` (matches reference server)."""
    return {"success": True, "results": items}

def per_element_success(element_id: str, result: dict) -> dict:
    """Per-element wrapper inside a bulk response. `subscriptionId` and
    `error` are always present (null for non-subscription / success cases)."""
    return {
        "success": True,
        "elementId": element_id,
        "subscriptionId": None,
        "result": result,
        "error": None,
    }

def per_element_error(element_id: str, code: str, message: str) -> dict:
    return {
        "success": False,
        "elementId": element_id,
        "subscriptionId": None,
        "result": None,
        "error": {"code": code, "message": message},
    }

def vqt(value, quality: str, timestamp: datetime) -> dict:
    """Reference-shape value-quality-timestamp.
    Quality is Pascal-case (Good/Bad/Uncertain/GoodNoData).
    Timestamp is second precision; ms not required by the reference."""
    return {
        "isComposition": False,
        "value": value,
        "quality": quality,
        "timestamp": timestamp.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "components": None,
    }

def history_result(values: list[dict]) -> dict:
    """The `result` field of a /history per-element entry."""
    return {
        "isComposition": False,
        "values": values,
    }

def object_instance(element_id, display_name, type_element_id,
                    parent_id=None, is_composition=False, is_extended=False) -> dict:
    """ObjectInstance dict — exact field set the reference server returns.
    No `hasChildren`, no `namespaceUri` per object."""
    return {
        "elementId":       element_id,
        "displayName":     display_name,
        "typeElementId":   type_element_id,
        "parentId":        parent_id,
        "isComposition":   is_composition,
        "isExtended":      is_extended,
    }
```

Routes call these instead of constructing dicts inline. Tests assert the
envelope shape directly against captured reference-server responses
(see Appendix C).

---

## 8. Testing strategy

### Unit tests

- **Envelope tests** — every helper produces spec-shape output (Pascal-case
  quality, ISO timestamp with ms and Z suffix, bulk wrapper structure)
- **Model tests** — the static catalog has 4 folders + 9 tags + 1 dataset,
  every elementId is unique, parent/child relationships are consistent
- **Route tests** — each endpoint returns spec shape for happy path and
  per-element error case (unknown elementId, malformed request body)
- **Mock LatestState/buffer** — route tests don't depend on a live processing loop

### Integration tests (manual until automated)

- **ACE i3X Explorer** ([cesmii/i3x-explorer](https://github.com/cesmii/i3X-explorer))
  point at `http://localhost:3030/api/i3x/` and:
  - Browse the catalog → verify all 4 folders and 9 tags appear under
    the expected hierarchy
  - Query value on `kw` → verify Good quality + sensible kW number
  - Query history on `kw` for the last hour → verify ~60 points returned
  - Query value on a passthrough tag (`motor_amps`) → verify it matches
    the upstream historian's value
- **Curl smoke tests** documented in `docs/phase3-shipped.md`

### Spec validator

If CESMII publishes a 1.0-Beta validator (check the repo), run it. If
not, hand-comparing responses to the spec's example payloads is the
standard.

---

## 9. Phase 4 — Subscriptions (deferred)

Subscriptions let clients receive value-change notifications without
polling. Spec defines two delivery modes:

- **Sync (`GET /subscriptions/{id}/sync`)** — long-poll style; client polls
  the endpoint, server returns any queued changes since last poll. Simple
  to implement; works through corporate proxies.
- **Stream (`GET /subscriptions/{id}/stream`)** — Server-Sent Events; server
  pushes changes as they happen. Lower latency; harder to operate (timeouts,
  reconnection, heartbeats).

Implementation backbone: an asyncio `pub_sub` fed by Phase 2's processing
loop. Each `_tick()` that mutates `LatestState` publishes a change event;
subscriptions consume from the bus.

**Order of work** (when Phase 4 starts):

1. `POST /subscriptions` create (returns subscription id, client provides
   list of elementIds + optional sampling interval)
2. `DELETE /subscriptions/{id}` cleanup
3. `GET /subscriptions/{id}/sync` poll mode
4. `GET /subscriptions/{id}/stream` SSE mode (last because of lifecycle complexity)
5. Subscription expiry / GC for abandoned subscriptions

Out of scope for Phase 3.

---

## 10. Auth and deployment

**Phase 3 ships with the i3X server open** (no authentication) inside the
`infrastructure` Docker network — same pattern as the upstream Timebase
historian.

If the producer ever needs to be exposed externally (corporate WAN,
internet), Traefik handles edge auth — same way `historian.tse.prod`
already does for the historian. The application code stays
authentication-naive; auth is an operational concern handled at the
ingress layer.

**Deployment:** the new endpoints go in the existing FastAPI app on port
3030. Existing Docker Compose stack picks them up automatically; no new
container or port to expose.

---

## 11. Open questions to resolve before starting

1. **ElementId format — slug-style (Option A in §3) or path-style (Option B).**
   Recommend slug-style to match the reference server, but path-style is
   more human-readable. Decide once and don't revisit; renaming
   elementIds later breaks every cached client.
2. **ObjectType strategy — custom type or ISA-95.** Custom type
   (`dairy-separator-type` in our namespace) is simple and self-contained;
   ISA-95 (`work-unit-type` from `https://isa.org/isa95`) is more
   industrially correct and matches what the reference server publishes.
   Recommend custom for v1, ISA-95 alignment as a follow-up.
3. **Concrete consumer.** Architecture doc §10 says "Don't build Phase 3
   until you have a concrete consumer asking for it." Who's the first
   consumer? (MaestroHub Contextualize? a Grafana dashboard? Claude
   Desktop with MCP?) The answer shapes which endpoints are highest
   priority and whether subscriptions matter from day 1.
4. **History beyond 24h** for derived signals — Option A (passthrough
   raw tags only, derived signals capped at 24h) or Option B (persistent
   buffer, derived signals available indefinitely)?
5. **Write capabilities.** The reference server advertises
   `update.{current,history}` as part of capabilities. **Do we accept
   writes?** Recommend `false` for both in v1 — Rav2.21's signals are
   computed from upstream data, not user-settable. But this is a real
   spec feature and should be a deliberate "no" not an accidental "no."
6. **Per-element error envelope shape.** The reference server captures
   we have are all success cases. Need to probe a known-bad elementId
   to confirm the `error` shape (`{code, message}`? something richer?)
   before our envelope helpers stabilize.
7. **Multi-separator support.** Currently single. If a second separator
   ships before Phase 3, the object model needs to extend and the
   publishing config needs to be data-driven. If later, single-instance
   is fine.
8. **`cost_today` reset semantics.** Currently resets at facility-local
   midnight US/Pacific. For an i3X consumer in another time zone, this
   might surprise. Document explicitly in the tag's description.
9. **Dataset naming.** `Separator Energy` is fine for one separator;
   if it becomes "everything Driftwood publishes" the name might want
   to be broader. Decide now or live with a rename later.

---

## 12. Recommended order of operations

Build in this sequence — each step ships something usable:

1. **Skeleton + `/info` + `/namespaces`** — proves the routing works,
   external clients can reach it. ~1 hour.
2. **`model.py` + `/objecttypes` + `/objects` + `/objects/list` +
   `/objects/related`** — the entire static catalog. ACE Explorer can
   browse, but no live data yet. ~half a day.
3. **`envelope.py` + `/objects/value`** — connect to `LatestState`. ACE
   Explorer can read live values. **The first useful checkpoint.**
   ~half a day.
4. **`/objects/history`** — connect to ring buffer (derived) and
   historian (passthrough). ACE Explorer can see trend lines. ~1 day.
5. **Tests + docs.** Write `phase3-shipped.md` analog to phase1-shipped.
   Update `i3x-integration.md` §5 Phase 3 status. ~half a day.
6. **Validation against an external client** — ACE Explorer or a script
   written against the CESMII sample SDK. Iterate on any spec
   non-compliance until it passes. Variable; budget half a day.

**Total estimate for Phase 3 v1 (no subscriptions): ~3 days of focused work.**
Phase 4 (subscriptions) is a separate ~3-day chunk.

---

## 13. Acceptance criteria

Phase 3 v1 ships when all of these are true:

1. `GET /api/i3x/info` returns spec-shape `{success, result}` with
   `specVersion: "1.0-Beta"` and the dashboard's namespace.
2. ACE i3X Explorer (or equivalent) browses to
   `Separator Energy:Driftwood Dairy/El Monte CA/Separator/1` and lists
   all 9 tags with correct dataType, uom, description.
3. `POST /api/i3x/objects/value` against any tag returns the live
   `LatestState` value with quality `Good` (or `Uncertain` when stale),
   millisecond-precision UTC timestamp, and the bulk envelope.
4. `POST /api/i3x/objects/history` against any tag returns the last 24h
   from the ring buffer (derived) or the historian (passthrough), with
   the bulk envelope and per-point VQT records.
5. Unknown elementIds return per-element `{success: false, error: {...}}`
   inside a successful bulk wrapper — not a 4xx.
6. Response shapes match the 1.0-Beta spec's example payloads byte-for-byte
   (Pascal-case quality, ms-precision ISO timestamps, bulk envelope).
7. New endpoints don't degrade existing dashboard performance —
   `/api/energy/current` still <50ms, no regression on Phase 2 acceptance
   criteria.
8. Test suite stays green; new test files cover envelope helpers, model
   integrity, and at least one happy-path + one error case per endpoint.
9. `docs/phase3-shipped.md` exists with the smoke-test plan, file diff,
   and rollback procedure (analog to `docs/phase1-shipped.md`).

---

## 14. What's explicitly NOT in Phase 3 v1

- **Subscriptions.** Sync poll and SSE stream live in Phase 4.
- **Authentication.** Edge auth handled by Traefik when needed; app stays
  open inside the infrastructure network.
- **Multi-separator support.** Single instance only. Refactor when there's
  a real second separator.
- **History beyond the 24h ring buffer** for derived signals (state, kw,
  cost). Passthrough tags can go further back via the historian.
- **Configuration UI** to change the published model. The model is code.
- **Frontend changes.** The React dashboard already consumes Rav2.21's
  internal `/api/energy/*` routes — it doesn't need to talk to its own
  i3X producer.

---

## Appendix A — Quick smoke tests for after v1 ships

```bash
# 1. Probe /info
curl -s http://localhost:3030/api/i3x/info | jq .

# 2. Browse catalog
curl -s http://localhost:3030/api/i3x/objects | jq .

# 3. Get the four key derived values
curl -s -X POST http://localhost:3030/api/i3x/objects/value \
  -H 'Content-Type: application/json' \
  -d '{"elementIds":[
    "Separator Energy:Driftwood Dairy/El Monte CA/Separator/1/state",
    "Separator Energy:Driftwood Dairy/El Monte CA/Separator/1/kw",
    "Separator Energy:Driftwood Dairy/El Monte CA/Separator/1/cost_per_hour",
    "Separator Energy:Driftwood Dairy/El Monte CA/Separator/1/cost_today"
  ]}' | jq .

# 4. Last hour of kW
curl -s -X POST http://localhost:3030/api/i3x/objects/history \
  -H 'Content-Type: application/json' \
  -d '{
    "elementIds":["Separator Energy:Driftwood Dairy/El Monte CA/Separator/1/kw"],
    "startTime":"'"$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)"'",
    "endTime":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }' | jq '.results[0].result.values | length'
# Expected: 60 points (one per minute, last hour)
```

---

## Appendix B — Reference

- **i3X spec:** https://github.com/cesmii/i3X
- **i3X SDK / server-developer overview:** https://www.i3x.dev/sdk/Server-Developers/overview
- **Reference server (live):** https://api.i3x.dev/v1
- **i3X Explorer (ACE):** https://github.com/cesmii/i3X-explorer
- **Architecture doc:** [`docs/i3x-integration.md`](./i3x-integration.md)
  — especially §3 (target architecture), §4 (published object model),
  §5 (phasing)
- **Phase 1 + 2 manifest:** [`docs/phase1-shipped.md`](./phase1-shipped.md)
- **i3X-flavored consumer client (reference for the Timebase dialect we
  consume; do NOT copy its quirks to the producer side):**
  [`backend/services/i3x_client.py`](../separator-energy-dashboard/backend/services/i3x_client.py)

---

## Appendix C — Live captures from `api.i3x.dev/v1` (2026-05-10)

Source-of-truth wire shapes. If anything in §6 or §7 disagrees with
what's in this appendix, **the appendix wins** — it's what real clients
will see.

### `GET /v1/info`

```json
{
  "success": true,
  "result": {
    "specVersion": "1.0",
    "serverVersion": "beta",
    "serverName": "i3X API Beta",
    "capabilities": {
      "query":     { "history": true },
      "update":    { "current": true, "history": false },
      "subscribe": { "stream": true }
    }
  }
}
```

### `GET /v1/namespaces`

```json
{
  "success": true,
  "result": [
    { "uri": "https://cesmii.org/i3x",          "displayName": "I3X" },
    { "uri": "https://isa.org/isa95",           "displayName": "ISA95" },
    { "uri": "https://abelara.com/equipment",   "displayName": "Abelara Equipment" },
    { "uri": "https://thinkiq.com/equipment",   "displayName": "ThinkIQ Equipment" }
  ]
}
```

Note `displayName` (not `name`).

### `POST /v1/objects/list` with empty `elementIds`

Rejected with HTTP 422 — Pydantic validation error:

```json
{
  "detail": [{
    "type": "value_error",
    "loc": ["body"],
    "msg": "Value error, 'elementIds' must contain at least one element",
    "input": {"elementIds": []}
  }]
}
```

We should match this validation behavior.

### `POST /v1/objects/list` with one valid elementId

```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "elementId": "pump-101-measurements-bearing-temperature-value",
      "result": {
        "elementId":     "pump-101-measurements-bearing-temperature-value",
        "displayName":   "Pump 101 Bearing Temperature Value",
        "typeElementId": "measurement-value-type",
        "parentId":      "pump-101-bearing-temperature",
        "isComposition": false,
        "isExtended":    false
      }
    }
  ]
}
```

ObjectInstance has exactly six fields: `elementId`, `displayName`,
`typeElementId`, `parentId`, `isComposition`, `isExtended`.

### `POST /v1/objects/value`

```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "elementId": "pump-101-measurements-bearing-temperature-value",
      "subscriptionId": null,
      "result": {
        "isComposition": false,
        "value": 1.0592675743920453e-09,
        "quality": "Good",
        "timestamp": "2026-05-10T22:26:41Z",
        "components": null
      },
      "error": null
    }
  ]
}
```

Per-element entry has six keys: `success`, `elementId`, `subscriptionId`,
`result`, `error`. Result has five: `isComposition`, `value`, `quality`,
`timestamp`, `components`. Quality is Pascal-case `Good`. Timestamp is
second precision.

### `POST /v1/objects/history` (window with no data)

```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "elementId": "pump-101-measurements-bearing-temperature-value",
      "subscriptionId": null,
      "result": {
        "isComposition": false,
        "values": []
      },
      "error": null
    }
  ]
}
```

Empty windows return `result.values: []` — not a 4xx, not a per-element
error.

### `GET /v1/objecttypes` (excerpt — first three types)

```json
{
  "success": true,
  "result": [
    {
      "elementId":     "work-center-type",
      "displayName":   "WorkCenterType",
      "namespaceUri":  "https://isa.org/isa95",
      "sourceTypeId":  "WorkCenterType",
      "version":       null,
      "schema": {
        "description": "ISA-95 Work Center - organizational container with HasChildren relationships",
        "type": "object"
      },
      "related": {
        "relationshipType": "HasChildren",
        "types": ["https://isa.org/isa95:work-unit-type"]
      }
    },
    {
      "elementId":     "work-unit-type",
      "displayName":   "WorkUnitType",
      "namespaceUri":  "https://isa.org/isa95",
      "sourceTypeId":  "WorkUnitType",
      "version":       null,
      "schema": {
        "description": "ISA-95 Work Unit - can be simple or complex with HasComponent relationships to child elements",
        "type": "object"
      },
      "related": { "relationshipType": "HasComponent" }
    },
    {
      "elementId":     "state-type",
      "displayName":   "StateType",
      "namespaceUri":  "https://abelara.com/equipment",
      "sourceTypeId":  "StateType",
      "version":       null,
      "schema": {
        "type": "object",
        "properties": { "...": "..." }
      }
    }
  ]
}
```

ObjectType has seven fields: `elementId`, `displayName`, `namespaceUri`,
`sourceTypeId`, `version`, `schema` (a JSON Schema), `related` (a
relationship descriptor).

Note that types live in different namespaces (ISA-95, Abelara, ThinkIQ,
CESMII) — multi-namespace publishing is supported and used in practice.
