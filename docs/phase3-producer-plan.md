# Phase 3 — i3X Producer Implementation Plan

**Status:** Planning. Phases 1 and 2 shipped on `feat/i3x-consumer-client`.
**Goal:** Make Rav2.21 a 1.0-Beta-compliant i3X server so other applications
(Grafana, MES, AI agents, Claude Desktop / MCP clients, ACE i3X Explorer)
can browse, read, and subscribe to its derived energy signals.
**Pairs with:** [`docs/i3x-integration.md`](./i3x-integration.md) §3–§5 and
[`docs/phase1-shipped.md`](./phase1-shipped.md).

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

Target: **CESMII i3X 1.0-Beta** ([github.com/cesmii/i3X](https://github.com/cesmii/i3X)).

### Endpoints the spec defines

| Endpoint | Required for v1? | Notes |
|---|---|---|
| `GET /i3x/info` | ✅ | Server identity + capabilities |
| `GET /i3x/namespaces` | ✅ | List published namespaces |
| `GET /i3x/objecttypes` + `POST /i3x/objecttypes/query` | ✅ | Type definitions |
| `GET /i3x/relationshiptypes` + `POST /i3x/relationshiptypes/query` | ✅ | Relationship defs |
| `GET /i3x/objects` | ✅ | Full catalog browse |
| `POST /i3x/objects/list` | ✅ | Lookup by elementId |
| `POST /i3x/objects/related` | ✅ | Relationship traversal |
| `POST /i3x/objects/value` | ✅ | Current value reads |
| `POST /i3x/objects/history` | ✅ | Time-series reads |
| `POST /i3x/subscriptions` family | Phase 4 (optional v1) | Sync poll + SSE stream |

**v1 of Phase 3 ships everything except subscriptions.** Subscriptions
are valuable but a fully-async lifecycle is its own engineering effort
(see §9). Polling clients work fine without them.

### Spec-purity vs the consumer-side pragma

Our consumer client (`backend/services/i3x_client.py`) deliberately does
NOT match the spec — it speaks Timebase's pre-1.0 dialect because that's
what the historian actually emits. **The producer does the opposite: it
must be 1.0-Beta-pure**, because we control the wire format and downstream
clients will assume strict compliance.

Three concrete spec details to honor on the producer side:

1. **Bulk-response envelope**: `{success: bool, results: [{success: bool, elementId, result|error}]}` for `/value` and `/history`
2. **Quality strings are Pascal-case**: `Good`, `Bad`, `Uncertain`, `GoodNoData` (not `"GOOD"` like Timebase)
3. **ISO 8601 timestamps with millisecond precision and `Z` suffix**: `2026-05-10T18:59:54.264Z`

The architecture doc §3 says "Phase 3 producer (when it ships) will be
1.0-Beta-compliant. That is the right place to be spec-pure because we
control the wire shape Rav2.21 publishes." Stick to that.

---

## 3. Published object model

Verbatim from [`docs/i3x-integration.md`](./i3x-integration.md) §4. This
is the *canonical* tree we publish; any deviation needs a doc update too.

**Namespace URI:** `https://rav221.tse.prod/separator-energy`
**Dataset:** `Separator Energy`

**Folders** (mirror the upstream physical hierarchy minus typos and
OT-edge artifacts):

```
Separator Energy:Driftwood Dairy
Separator Energy:Driftwood Dairy/El Monte CA
Separator Energy:Driftwood Dairy/El Monte CA/Separator
Separator Energy:Driftwood Dairy/El Monte CA/Separator/1
```

Note the corrections vs the upstream historian:
- "Separator" not "Seperator" (we fix the typo on republish)
- No "Raw Side" segment (it's an OT-edge artifact, not load-bearing)
- No "Edge" segment

**Tags published under `Separator/1`:**

| ElementId suffix | dataType | uom | Description |
|---|---|---|---|
| `state` | String | — | Processing \| CIP \| Idle \| Shutdown |
| `kw` | Double | kW | Live power draw |
| `cost_per_hour` | Double | USD/h | Live $/hr at current TOU rate |
| `cost_today` | Double | USD | Cumulative cost since local midnight (US/Pacific) |
| `tou_period` | String | — | On-Peak \| Mid-Peak \| Off-Peak \| Super Off-Peak |
| `shift` | String | — | 1st \| 2nd \| 3rd |
| `motor_amps` | Double | A | Passthrough from upstream Edge gateway |
| `running` | Boolean | — | Passthrough |
| `cip` | Boolean | — | Passthrough |

**ObjectType:** define a custom type `DairySeparator` with the above tags
as members. Other clients introspect via `/objecttypes`.

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

### `GET /api/i3x/info`

Returns server identity and capabilities.

```json
{
  "success": true,
  "result": {
    "specVersion": "1.0-Beta",
    "serverName": "Rav2.21 — Driftwood Separator Energy",
    "namespaceUri": "https://rav221.tse.prod/separator-energy",
    "capabilities": {
      "query": { "value": true, "history": true, "list": true, "related": true },
      "subscriptions": { "sync": false, "stream": false }
    }
  }
}
```

`subscriptions.sync` and `.stream` go to `true` when Phase 4 ships.

### `GET /api/i3x/namespaces`

```json
{
  "success": true,
  "result": [
    { "uri": "https://rav221.tse.prod/separator-energy", "name": "Separator Energy" }
  ]
}
```

Single namespace today. Future multi-separator deployments would extend.

### `GET /api/i3x/objecttypes` + `POST /api/i3x/objecttypes/query`

Returns the `DairySeparator` type definition listing tag members + their
dataType, uom, description. Static — doesn't change at runtime. Computed
once at startup from `i3x_server/model.py`.

### `GET /api/i3x/objects` and `POST /api/i3x/objects/list`

Returns ObjectInstance dicts for the catalog (4 folders + 9 tags = 13
objects). Each entry has `elementId`, `displayName`, `typeId`, `parentId`,
`isComposition`, `hasChildren`, `namespaceUri`. Static.

### `POST /api/i3x/objects/related`

Folder → child relationships. The 4 folders nest hierarchically; the 9
tags hang off `Separator/1`. Static traversal of the catalog.

### `POST /api/i3x/objects/value`

The hot path. For each requested elementId:

```jsonc
{
  "success": true,
  "results": [
    {
      "success": true,
      "elementId": "Separator Energy:Driftwood Dairy/El Monte CA/Separator/1/kw",
      "result": {
        "value": 33.6,
        "quality": "Good",
        "timestamp": "2026-05-10T22:14:33.221Z"
      }
    },
    ...
  ]
}
```

**Source:** `processing.get_latest()` for all tags. Build a
`tagId -> (value, timestamp, quality)` map at request time:

- `state`, `kw`, `cost_per_hour`, `cost_today`, `tou_period`, `shift`,
  `motor_amps`, `running`, `cip` → all from LatestState fields
- `quality`: `Good` if `LatestState.is_stale` is False, `Uncertain` if
  stale, `Bad` if `last_good_update` is None
- `timestamp`: `LatestState.last_updated`

For unknown elementIds: per-element `{success: false, error: {code: "NotFound", message: "..."}}`.

**Latency target:** <50ms (no historian round-trip — pure in-memory read).

### `POST /api/i3x/objects/history`

```jsonc
{
  "success": true,
  "results": [
    {
      "success": true,
      "elementId": "...kw",
      "result": {
        "values": [
          { "value": 33.5, "quality": "Good", "timestamp": "2026-05-10T18:00:00.000Z" },
          { "value": 33.7, "quality": "Good", "timestamp": "2026-05-10T18:01:00.000Z" },
          ...
        ]
      }
    }
  ]
}
```

**Source for derived signals (state, kw, $/hr, etc.):**
`processing.timeline_points()` — filtered to the requested
`[startTime, endTime]` window. If window > 24h: return only what the
buffer has (or 200 with `{"data": []}` per the spec's "no data" case).

**Source for passthrough tags (motor_amps, running, cip):** historian via
existing `historian_client.fetch_tag_history()`. They're available all the
way back.

**Window validation:** reject `startTime > endTime` with 400. Cap the
maximum window length (e.g., 7 days) to prevent runaway queries.

### `POST /api/i3x/subscriptions/*` (Phase 4 — defer)

See §9.

---

## 7. Wire-format envelope module

`backend/i3x_server/envelope.py` centralizes spec compliance. Helpers:

```python
def bulk_success(items: list[dict]) -> dict:
    """Wrap a list of per-elementId results in the bulk envelope."""
    return {"success": True, "results": items}

def per_element_success(element_id: str, result: dict) -> dict:
    return {"success": True, "elementId": element_id, "result": result}

def per_element_error(element_id: str, code: str, message: str) -> dict:
    return {
        "success": False,
        "elementId": element_id,
        "error": {"code": code, "message": message},
    }

def vqt(value, quality: str, timestamp: datetime) -> dict:
    """Spec-shape value-quality-timestamp record."""
    return {
        "value": value,
        "quality": quality,                                           # Pascal case
        "timestamp": timestamp.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z",
    }
```

Routes call these instead of constructing dicts inline. Tests assert the
envelope shape directly.

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

1. **Concrete consumer.** Architecture doc §10 says "Don't build Phase 3
   until you have a concrete consumer asking for it." Who's the first
   consumer? (MaestroHub? a Grafana dashboard? Claude Desktop with MCP?)
   The answer shapes which endpoints are highest priority and whether
   subscriptions matter from day 1.
2. **History beyond 24h** for derived signals — Option A (passthrough
   raw tags only) or Option B (persistent buffer)?
3. **Multi-separator support.** Currently single. If the second separator
   ships before Phase 3, the object model needs to extend
   (`Separator/1`, `Separator/2`, ...) and the publishing config needs
   to be data-driven. If it's later, single-instance is fine.
4. **`cost_today` reset semantics.** Currently resets at facility-local
   midnight US/Pacific. For an i3X consumer in another time zone, this
   might surprise. Document explicitly in the tag's description.
5. **Dataset naming.** `Separator Energy` is fine for one separator;
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

- **i3X 1.0-Beta spec:** https://github.com/cesmii/i3X
- **i3X Explorer (ACE):** https://github.com/cesmii/i3X-explorer
- **Architecture doc:** [`docs/i3x-integration.md`](./i3x-integration.md)
  — especially §3 (target architecture), §4 (published object model),
  §5 (phasing)
- **Phase 1 + 2 manifest:** [`docs/phase1-shipped.md`](./phase1-shipped.md)
- **i3X-flavored consumer client (reference for spec deviations to NOT
  copy on the producer side):** [`backend/services/i3x_client.py`](../separator-energy-dashboard/backend/services/i3x_client.py)
