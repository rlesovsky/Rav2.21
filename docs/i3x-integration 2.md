# Rav2.21 — i3X Integration Architecture

**Status:** Phase 0 complete. Phase 1 (consumer client) ready to start.
**Owners:** Randy Lesovsky (architect), Cursor (implementation), Claude (review/orchestration).
**Scope:** Add full i3X interoperability — consume tag data from Timebase via i3X, and publish Rav2.21's derived signals (state, kW, cost, TOU period, shift) as an i3X server so other clients can browse and subscribe.

This document is the source of truth for all i3X-related work. Every task brief references it. **Cursor: when in doubt about an API shape or naming convention, this doc wins over your priors.**

---

## 1. Background and goals

Rav2.21 currently reads four tags from a Timebase historian over its legacy REST API, classifies separator state, computes kW from motor amps, and applies SCE TOU-GS-2 pricing. The dashboard is the only consumer of those derived signals — they live and die inside FastAPI request handlers.

Timebase 1.3 added an i3X (CESMII Industrial Information Interoperability eXchange) API. We are doing two things:

1. **Consumer side** — replace the legacy historian client with an i3X-backed client. Same public surface inside Rav2.21 so the rest of the app doesn't move.
2. **Producer side** — turn Rav2.21 itself into an i3X server so its derived signals (state, kW, cost, TOU period, shift) are addressable by any other i3X client. This is the real interop win.

The dashboard frontend doesn't change. The processing logic doesn't change. What changes is how Rav2.21 talks to the world.

---

## 2. What Phase 0 confirmed

We captured live responses from `http://192.254.155.2:4511/i3x/*` against the Driftwood Historian. The findings below are facts, not assumptions.

### 2.1 Auth

The historian itself is open at `192.254.155.2:4511` — no auth required. The `historian.tse.prod` Traefik route adds Basic auth, but Rav2.21 talks to the historian directly via `TIMEBASE_HOST=192.254.155.2`, so no credentials are needed in the client.

The producer side (Rav2.21 publishing i3X) will follow the same pattern initially — open inside the `infrastructure` network, with Traefik handling auth at the edge if/when Rav2.21's i3X endpoint is exposed externally.

### 2.2 ElementId format

ElementIds are path-based, human-readable strings:

- Dataset: `Driftwood Historian`
- Folder: `Driftwood Historian:Driftwood Dairy/El Monte CA/Raw Side/Seperator`
- Tag:    `Driftwood Historian:Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/Motor Amps`

Format: `{dataset}:{path/with/slashes}`. Spaces are preserved. Typos are preserved (`Seperator` is real on the historian; we don't fix it client-side).

### 2.3 The four separator tags

```
Driftwood Historian:Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/Motor Amps
Driftwood Historian:Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/Running
Driftwood Historian:Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/CIP
Driftwood Historian:Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/Process
```

Bowl Speed is also available under the same Edge folder. Not currently used; flagged for future enrichment.

### 2.4 Response shapes (verbatim from live captures)

**`POST /i3x/objects/value`** — request:
```json
{ "elementIds": ["Dataset:path/Tag1", "Dataset:path/Tag2"] }
```
Response:
```json
{
  "Dataset:path/Tag1": {
    "data": [
      { "value": 0, "quality": "GOOD", "timestamp": "2026-05-10T10:37:07.446Z" }
    ]
  },
  "Dataset:path/Tag2": { "data": [ ... ] }
}
```

Single round trip for all four tags. This is a real efficiency win over the legacy four-call pattern.

**`POST /i3x/objects/history`** — request:
```json
{
  "elementIds": ["Dataset:path/Tag1"],
  "startTime": "2026-05-10T13:00:00Z",
  "endTime":   "2026-05-10T14:00:00Z"
}
```
Response: same dict shape as `value`, with multiple points in the `data` array.

**Quality is the string `"GOOD"`, not a numeric OPC-UA code.** This invalidates the existing `MIN_GOOD_QUALITY=192` env var. Replacement rule: `"GOOD"` passes; anything else is dropped.

**Timestamps are ISO 8601 UTC with millisecond precision and `Z` suffix.** Native parsers in Python (`pandas.to_datetime`, `datetime.fromisoformat` after `.replace('Z','+00:00')`) and JS (`dayjs`) handle these directly.

### 2.5 Known quirks

**Boundary points in history.** When there is no data inside the requested window, Timebase returns the most recent point *outside* the window. Example: requesting 13:00–14:00 returned a single point at 10:37. This is forward-fill seed data, not data within the window.

**Adapter rule:** in the i3X client, after parsing a history response, clamp every point's timestamp to `[startTime, endTime]`. If a point's timestamp is before `startTime`, snap it to `startTime`. This keeps `state_engine.build_dataframe` (which resamples to 1-minute and forward-fills) behaving correctly when the upstream is sparse or stale.

**`/value` returns errors as 200 OK with an error body** when an elementId is invalid:
```json
{ "error": "elementId not found: ...", "reason": "..." }
```
But `/history` returns 200 OK with `{"data": []}` for both "no data in window" and "tag doesn't exist". **History cannot distinguish missing tags from empty windows.** The client must validate elementIds at startup using `POST /i3x/objects/list`, not rely on history errors.

**Sparse / stale tags.** During Phase 0, all four separator tags returned `value: 0` with timestamps four hours old. This is an upstream issue (Edge gateway not updating), not an i3X issue. Flagged but out of scope.

### 2.6 Object types and schema

Three types: `Dataset`, `Folder`, `Tag`. Folders are virtual (derived from tag path segments). Tag schema includes optional `dataType`, `uom`, `format`, `description`. Producer side will populate these for our derived signals.

### 2.7 Two datasets exist on this historian

`Driftwood Historian` and `The Juice Factory`. The consumer client must always scope to its configured dataset (`TIMEBASE_DATASET`). Don't iterate or assume.

---

## 3. Target architecture

```
┌─────────────────────────────────────────────────────────────────┐
│         Other i3X clients (Grafana, MES, AI agents, MCP)         │
│         ──── browse, value, history, subscribe ────►             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Rav2.21 — i3X SERVER                          │
│  Mounted at /api/i3x/* on the existing FastAPI app               │
│  Namespace:  https://rav221.tse.prod/separator-energy            │
│  Dataset:    Separator Energy                                    │
│  Object:     Separator Energy:Driftwood Dairy/El Monte CA/       │
│              Separator/1                                         │
│  Tags:       state, kw, cost_per_hour, cost_today, tou_period,   │
│              shift, motor_amps (passthrough), running, cip       │
└────────────┬─────────────────────────────────┬─────────────────┘
             │                                 │
             │ i3X CLIENT (reads upstream)     │ Same FastAPI app
             ▼                                 ▼
┌──────────────────────────┐      ┌──────────────────────────────┐
│  Timebase Historian       │      │  Existing /api/energy/* and   │
│  http://192.254.155.2:4511 │     │  /api/config routes serving   │
│  /i3x/*                   │      │  the React dashboard          │
│  Tags: Motor Amps, Running│      │  (unchanged)                  │
│        CIP, Process       │      │                               │
└──────────────────────────┘      └──────────────────────────────┘
```

The producer and consumer share one FastAPI process. They both read from a continuous **processing service** (Phase 2) that holds the latest derived state in memory and persists a recent history buffer.

---

## 4. Published object model (producer side)

This is what other i3X clients will see when they browse Rav2.21.

**Namespace URI:** `https://rav221.tse.prod/separator-energy`

**Dataset:** `Separator Energy`

**Folders (mirror the upstream physical hierarchy, minus typos and OT-edge artifacts):**

- `Separator Energy:Driftwood Dairy`
- `Separator Energy:Driftwood Dairy/El Monte CA`
- `Separator Energy:Driftwood Dairy/El Monte CA/Separator`
- `Separator Energy:Driftwood Dairy/El Monte CA/Separator/1`

**Tags (under `Separator/1`):**

| ElementId suffix | Type   | Unit  | Description                                             |
|------------------|--------|-------|---------------------------------------------------------|
| `state`          | String | —     | Processing \| CIP \| Shutdown                           |
| `kw`             | Double | kW    | Live power draw                                         |
| `cost_per_hour`  | Double | USD/h | Live $/hr at current TOU rate and kW                    |
| `cost_today`     | Double | USD   | Cumulative cost since local midnight                    |
| `tou_period`     | String | —     | On-Peak \| Mid-Peak \| Off-Peak \| Super Off-Peak       |
| `shift`          | String | —     | 1st \| 2nd \| 3rd                                       |
| `motor_amps`     | Double | A     | Passthrough from upstream                               |
| `running`        | Bool   | —     | Passthrough                                             |
| `cip`            | Bool   | —     | Passthrough                                             |

We expose passthrough tags too because it lets other i3X clients consume *all* the inputs and derived outputs of this app from one place. That's the whole point of producing i3X — Rav2.21 becomes the canonical source for "everything about Separator 1's energy story."

**ObjectType:** define a custom type `DairySeparator` with the above tags as members. Other clients can introspect the type via `/objecttypes`. Schema follows the Tag-with-`dataType`-and-`uom` pattern from Timebase.

---

## 5. Phasing

### Phase 1 — Consumer i3X client (replaces `timebase_client.py`)

New module `backend/services/i3x_client.py`. Same public function signatures as the legacy client so the rest of the backend doesn't move:

- `fetch_current_values() -> dict[str, float|bool|None]`
- `fetch_all_tags(start, end) -> dict[str, list[{t,v,q}]]`
- `fetch_tag_history(tag_path, start, end) -> list[{t,v,q}]`

Internally uses i3X endpoints. Adapts response shape and clamps boundary points (see §2.5). Quality filter: `"GOOD"` passes, anything else drops.

Validates configured ElementIds at startup via `POST /i3x/objects/list`. Logs an error and refuses to start if any tag is missing, rather than silently returning empty data.

Legacy client kept as `timebase_client_legacy.py` behind `USE_I3X` env flag for fallback during commissioning. Default `USE_I3X=true` after Phase 1 ships.

**Acceptance criteria:**
1. `/api/raw?hours=1` returns the same shape as it did pre-change, with at least one valid point per tag (assuming upstream is healthy).
2. `/api/energy/current` returns the same JSON structure as before.
3. With `USE_I3X=false`, behavior reverts to the legacy client unchanged.
4. ElementId validation at startup fails loudly with a clear message if a tag is missing.
5. Quality filter drops non-`"GOOD"` points; verified with a unit test using a synthetic response.
6. Boundary-point clamping: a unit test feeds a history response with a timestamp before `startTime` and asserts the adapter snaps it to `startTime`.

### Phase 2 — Continuous processing service

Right now, `state_engine` and `cost_calculator` run inside FastAPI request handlers. To publish derived values via i3X, they must run *continuously*, not on demand.

New module `backend/services/processing.py`:

- Background task started at app startup (`@app.on_event("startup")` or lifespan).
- Loop interval configurable via `PROCESSING_INTERVAL_SECONDS` (default 5).
- Each tick: pull current values via i3X client → classify state → compute kW, $/hr, $/today, tou_period, shift → write to an in-memory `LatestState` object and append to a ring buffer (size = `PROCESSING_BUFFER_MINUTES`, default 1440 = 24h at 1-min granularity).
- Existing `/api/energy/current` switches to reading `LatestState` instead of fetching live (instant response, no historian round trip).
- `/api/energy/timeline` reads from the ring buffer for the last 24h; falls back to historian for older windows.
- `/api/energy/summary` and `/api/energy/daily` continue fetching from the historian (longer windows, not worth buffering).

**Acceptance criteria:**
1. App starts, processing loop runs, `LatestState` populates within one interval.
2. `/api/energy/current` returns in <50ms with no historian call.
3. Stopping the historian doesn't crash the app — processing logs errors, retains last good state, and keeps serving stale data with a `lastUpdated` field consumers can read.
4. Ring buffer trims to configured size; no memory leak under 24h soak.

### Phase 3 — Producer i3X server

New package `backend/i3x_server/` with FastAPI sub-router mounted at `/api/i3x/*`. Implements the spec endpoints:

- `GET /namespaces`, `GET /objecttypes`, `POST /objecttypes/query`
- `GET /relationshiptypes`, `POST /relationshiptypes/query`
- `GET /objects`, `POST /objects/list`, `POST /objects/related`
- `POST /objects/value`, `POST /objects/history`

Backed entirely by Phase 2's `LatestState` and ring buffer. The static parts (namespace, object types, object tree, relationships) are computed once at startup from a config module `i3x_server/model.py` that defines the published object model in §4.

**Acceptance criteria:**
1. ACE i3X Explorer (or equivalent) can browse to `Separator Energy:Driftwood Dairy/El Monte CA/Separator/1` and list all tags.
2. `POST /i3x/objects/value` against any of the tags returns the live `LatestState` value with quality `"GOOD"` and current timestamp.
3. `POST /i3x/objects/history` against any tag returns ring-buffer data within the requested window, with proper boundary handling.
4. Response shapes byte-match the spec examples (Cursor: validate against `docs/i3x-spec-snapshot.md` which we'll create from the captures).
5. Error handling mirrors Timebase's behavior — `/objects/value` returns 200 with an error body for unknown elementIds; `/history` returns 200 with empty data.

### Phase 4 — Subscriptions (producer-side first)

`POST /i3x/subscriptions` family on the producer side. Backed by an asyncio pub-sub fed by the Phase 2 processing loop.

- Sync-poll (`/subscriptions/{id}/sync`) ships first. Simpler, fewer edge cases.
- SSE (`/subscriptions/{id}/stream`) ships second. Requires lifecycle handling, heartbeat, client disconnect cleanup.

Optional sub-phase: convert the consumer client to use Timebase subscriptions instead of polling. Nice but not required.

### Phase 5 — Validation

End-to-end with a real third-party i3X client (ACE Explorer or a script written against the cesmii sample SDK). Confirm:

- Browse works
- Read works (current + history)
- Subscribe works (poll + stream)
- Multiple concurrent subscriptions work
- Subscription cleanup on client disconnect

### Phase 6 — Polish

OpenAPI spec for the producer endpoints (FastAPI generates it; we just review). README updates. `.env.example` updates. Compose file updates if any new env vars need defaults.

---

## 6. Environment variables

### New (added)

| Name                          | Default                                                                | Purpose                                |
|-------------------------------|------------------------------------------------------------------------|----------------------------------------|
| `USE_I3X`                     | `true`                                                                 | Flip to legacy client during rollback  |
| `I3X_BASE_URL`                | `http://192.254.155.2:4511`                                            | Historian i3X root                     |
| `I3X_DATASET`                 | `Driftwood Historian`                                                  | Dataset to scope to                    |
| `I3X_SEPARATOR_BASE_PATH`     | `Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge`                | Path under dataset where tags live     |
| `I3X_TAG_MOTOR_AMPS`          | `Motor Amps`                                                           | Tag name (joined with base path)       |
| `I3X_TAG_RUNNING`             | `Running`                                                              | Tag name                               |
| `I3X_TAG_CIP`                 | `CIP`                                                                  | Tag name                               |
| `I3X_TAG_PROCESS`             | `Process`                                                              | Tag name                               |
| `I3X_TIMEOUT_SECONDS`         | `10`                                                                   | httpx timeout                          |
| `PROCESSING_INTERVAL_SECONDS` | `5`                                                                    | Phase 2 loop tick                      |
| `PROCESSING_BUFFER_MINUTES`   | `1440`                                                                 | Phase 2 ring buffer size               |
| `I3X_PRODUCER_NAMESPACE_URI`  | `https://rav221.tse.prod/separator-energy`                             | Phase 3 — what we publish as           |
| `I3X_PRODUCER_DATASET`        | `Separator Energy`                                                     | Phase 3                                |

### Removed (or made obsolete)

| Name                | Replaced by                                    |
|---------------------|------------------------------------------------|
| `MIN_GOOD_QUALITY`  | Hardcoded string filter in i3X adapter (`GOOD`) |
| `TIMEBASE_HOST`     | Folded into `I3X_BASE_URL`                     |
| `TIMEBASE_PORT`     | Folded into `I3X_BASE_URL`                     |
| `TIMEBASE_DATASET`  | Renamed `I3X_DATASET`                          |

Old vars may be kept as deprecated aliases during Phase 1 to avoid breaking existing deployments. Drop them in Phase 6.

---

## 7. ElementId construction (consumer side)

```python
def build_tag_element_id(dataset: str, base_path: str, tag_name: str) -> str:
    return f"{dataset}:{base_path}/{tag_name}"

# Example:
# build_tag_element_id(
#     "Driftwood Historian",
#     "Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge",
#     "Motor Amps"
# )
# -> "Driftwood Historian:Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/Motor Amps"
```

No URL encoding inside the JSON body. ElementIds with spaces are sent as-is. They are NOT path components in the HTTP request — they're values inside a JSON request body.

---

## 8. Internal data shape (the contract Phase 1 must preserve)

The legacy client returns this shape, and the rest of the app depends on it. Phase 1 must not change it:

```python
# fetch_current_values()
{
    "motor_amps": 12.4,    # float | None
    "running":    True,    # bool | None
    "cip":        False,   # bool | None
    "process":    True     # bool | None
}

# fetch_all_tags(start, end)
{
    "motor_amps": [{"t": "<iso>", "v": 12.4, "q": <int>}, ...],
    "running":    [{"t": "<iso>", "v": True, "q": <int>}, ...],
    "cip":        [...],
    "process":    [...]
}
```

Note: the existing `q` field is an integer. Cursor: keep it integer for backward compatibility — map `"GOOD"` to `192`, anything else to `0`. The state engine already filters with `MIN_GOOD_QUALITY=192`, and this lets the rest of the pipeline stay untouched.

---

## 9. Things Cursor will get wrong if not warned

This section exists because LLMs hallucinate API shapes. Each item below has been confirmed against a live capture.

1. **Quality is a string, not a number.** `"GOOD"`. Not `192`. Not `0xC0`.
2. **`/value` and `/history` return a dict keyed by elementId**, not an array. Cursor's instinct will be array-of-objects with an `id` field. Wrong.
3. **History returns empty data for missing tags AND empty windows** with no way to distinguish. Validate at startup, don't rely on history errors.
4. **Boundary points exist in history responses.** If `startTime=13:00` and the tag last updated at 10:37, you get one point at 10:37. Clamp it to `startTime` in the adapter.
5. **ElementIds contain spaces.** `"Motor Amps"`, not `"MotorAmps"`. Don't camelCase or slugify.
6. **The folder is "Seperator", not "Separator".** Typo on the historian side. Preserve it.
7. **The request field is `elementIds` (plural, camelCase) on most endpoints, but `elementId` (singular) on `/objects/related`.** Read the spec carefully.
8. **`relationshiptype` (lowercase, not camelCase) on `/objects/related`.** Confirmed from spec example.
9. **Two datasets exist** on the historian. Always scope to the configured one.
10. **The historian is unauthenticated when reached directly.** No `Authorization` header needed for `192.254.155.2:4511`. Only `historian.tse.prod` (Traefik route) requires auth.

---

## 10. Open questions / out of scope

- **Subscriptions on the consumer side.** Polling is fine for now. Convert to SSE consumption only after producer-side subscriptions ship and we have a reason to lower latency.
- **Auth on the producer side.** Phase 3 ships open inside the network. If Rav2.21 ever exposes its i3X externally, we'll add Traefik Basic auth the same way the historian's external route does — no app-level changes needed.
- **Multi-separator support.** Out of scope. One separator config today. Refactor when there's an actual second.
- **Bowl Speed and other unused upstream tags.** Out of scope until requested.
- **Stale data on the upstream tags.** Not our problem to solve. Surface it in the dashboard with a `lastUpdated` indicator (already partially done) so it's visible when the Edge gateway is misbehaving.

---

## 11. Reference

- i3X spec (1.0-Beta): https://github.com/cesmii/i3X
- Timebase i3X Swagger (Driftwood instance): http://192.254.155.2:4511/api/i3x.json
- Timebase 1.3 release notes: https://docs.timebase.flow-software.com/knowledge-base/timebase-1.3-release-notes
- Captured response samples: `docs/i3x-spec-snapshot.md` (to be created from Phase 0 captures)
