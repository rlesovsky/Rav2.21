# Phase 1 + Phase 2 — Shipped

**Status:** Ready for review and smoke test on `feat/i3x-consumer-client`.
**Pairs with:** [`docs/i3x-integration.md`](./i3x-integration.md) (the plan).
**This document describes what landed.** Reviewer-facing — read alongside the diff.

---

## 1. Scope

This branch ships two phases together:

- **Phase 1 — i3X consumer client.** Replaces `services/timebase_client.py` (legacy
  REST historian client) with `services/i3x_client.py` (Timebase i3X-flavored API)
  behind a `USE_I3X` feature flag. Default `false` for safe rollout.
- **Phase 2 — Continuous processing service.** Adds `services/processing.py`: an
  asyncio loop that ticks every 5s, classifies state, computes kW + $/hr +
  $/today + TOU period + shift, and writes to an in-memory `LatestState` plus
  a 24-hour ring buffer. The dashboard's `/api/energy/current` and
  `/api/energy/timeline` now read from memory instead of round-tripping the
  historian on every request.

The two phases are orthogonal — Phase 1 is "what protocol does the historian
fetcher speak," Phase 2 is "where do request handlers read from." They were
built in the same branch because Phase 2's processing loop is the natural
consumer of Phase 1's dispatcher, and shipping them together avoids a
brief intermediate state where every dashboard request makes a fresh i3X call.

### Out of scope (deliberately)

- **Phase 3 — Producer-side i3X server.** Rav2.21 publishing its derived
  signals over `/api/i3x/*` for other clients (Grafana, MES, AI agents) to
  browse, value, history, subscribe. The work in this branch sets up the data
  source for it (`processing.LatestState` for `value`, the ring buffer for
  `history`) but does not implement any producer endpoints. Defer until a
  concrete consumer asks for it.
- **Phase 4 — Subscriptions** (consumer- or producer-side).
- **Frontend changes.** None. The React dashboard is unchanged.
- **Auth on the producer side.** Open inside `infrastructure` network for now;
  Traefik handles edge auth if/when the producer is exposed externally.

---

## 2. What changed (file-by-file)

### New files

- **`backend/services/i3x_client.py`** — Timebase i3X consumer. Public surface:
  `startup()`, `shutdown()`, `fetch_current_values()`, `fetch_all_tags()`,
  `fetch_tag_history()`, `get_info()`. Module-level `httpx.AsyncClient`
  initialized in `startup()`, closed in `shutdown()`.
- **`backend/services/historian_client.py`** — Dispatcher. Selects the i3X or
  the legacy backend at import time based on `USE_I3X`. Re-exports
  `fetch_current_values`, `fetch_all_tags`, `startup`, `shutdown`. Does NOT
  re-export `fetch_tag_history` — i3X expects a logical tag name as the first
  argument, the legacy client expects a full historian path; transparent
  cross-mode dispatch is unsafe so callers go through `fetch_all_tags`.
- **`backend/services/processing.py`** — Background processing loop, ring
  buffer, `LatestState` dataclass, public `start()`/`stop()`/`get_latest()`/
  `current_metrics()`/`timeline_points()`. `_tick()` is exposed for unit tests.
- **`backend/tests/test_i3x_client.py`** — 24 cases covering parser,
  quality filter, boundary clamp, startup validation, diagnostic info wrapper.
- **`backend/tests/test_processing.py`** — 7 cases covering tick population,
  fetch-failure resilience, ring-buffer trim, current-metrics shape, and the
  "no historian round-trip on /current" property.
- **`docs/phase1-shipped.md`** — this document.

### Renamed (no edits)

- `backend/services/timebase_client.py` → `backend/services/timebase_client_legacy.py`

### Edited

- **`backend/config.py`** — added `USE_I3X` (default `false`), `I3X_BASE_URL`,
  `I3X_DATASET`, `I3X_SEPARATOR_BASE_PATH`, the four `I3X_TAG_*` vars,
  `I3X_TIMEOUT_SECONDS`, `I3X_TAGS` dict, and the Phase 2 vars
  `PROCESSING_INTERVAL_SECONDS` (5), `PROCESSING_BUFFER_MINUTES` (1440),
  `STALE_THRESHOLD_SECONDS` (60). Legacy `TIMEBASE_*`, `TAGS`, and
  `MIN_GOOD_QUALITY` retained for the rollback path; do NOT remove these
  without a separate cleanup PR.
- **`backend/main.py`** — migrated from `@app.on_event("startup")`/`("shutdown")`
  (deprecated) to `@asynccontextmanager async def lifespan`. Order: startup is
  `historian_client.startup() → processing.start()`; shutdown reverses to
  `processing.stop() → historian_client.shutdown()`. New diagnostic endpoint
  `GET /api/i3x/info`.
- **`backend/routers/energy.py`** — imports `historian_client` instead of
  `timebase_client`. `/api/energy/current` reads from `processing.current_metrics()`
  (no historian I/O on the request path). `/api/energy/timeline` reads from the
  ring buffer with a one-shot historian fallback for cold-start. `/api/energy/summary`,
  `/api/energy/daily`, and `/api/raw` continue to fetch from the historian
  because their windows (7 days, arbitrary `?hours=N`) exceed the ring-buffer
  capacity.
- **`backend/models/schemas.py`** — `CurrentMetrics` gains `cost_today`,
  `last_updated`, `is_stale` (all backward-compatible: `Optional` / default
  `False`).
- **`docker-compose.yml`** and **`docker-compose.portainer.yml`** — added the
  full `I3X_*` env block (with `USE_I3X=false` default — flip to `true` after
  smoke test passes), the `PROCESSING_*` block, and `STALE_THRESHOLD_SECONDS`.
  Legacy `TIMEBASE_*`/`MIN_GOOD_QUALITY` retained for rollback.

### Unchanged (verify these untouched in the diff)

- `backend/services/state_engine.py`, `backend/services/cost_calculator.py`
- `frontend/` (entire tree)
- `backend/Dockerfile`, `backend/requirements.txt` (no new deps)

---

## 3. Wire-format constraints honored (against the live Timebase)

These are the things this client gets RIGHT against Timebase at
`http://192.254.155.2:4511/i3x/*`. All confirmed against captured live responses.

| Constraint | Why it matters |
|---|---|
| Quality is the literal string `"GOOD"`, uppercase. Maps to int `192` in the internal contract; anything else maps to `0` and the point is dropped. | Strict match. `Good` and `good` are rejected. If Timebase ever changes case, the smoke test fails loudly — that's the desired signal, not silent coercion. |
| `/i3x/objects/value` and `/i3x/objects/history` return a **flat dict keyed by elementId**: `{"<elementId>": {"data": [...]}}`. Not the spec's `{success, results: [...]}` envelope. | `_extract_value_results` handles only this shape. Spec-envelope support was deliberately removed — see §3.5. |
| `/i3x/objects/list` returns a **bare list of ObjectInstance dicts** — different envelope from `/value` and `/history`. Each entry has `elementId`, `displayName`, `typeId`, `parentId`, etc.; an `error` field on an entry means the requested ID was invalid. | Parsed by `_validate_element_ids`, which is intentionally separate from `_extract_value_results` because the response shape is different. Verified live on 2026-05-10 during the local smoke test — an earlier brief that claimed `/list` was dict-keyed was wrong, and removing the bare-list parser branch on its strength caused a boot failure that the smoke test caught before merge. |
| Per-tag errors come back as `{"error": "...", "reason": "..."}` in the elementId's slot, with HTTP 200. Treat as "tag unavailable" (None for current value, empty list for history); log per-tag. | History returns `200 + {"data": []}` for both "no data" and "tag missing." Per-tag errors and startup validation are the only ways to detect misconfiguration. |
| **Startup validation goes through `POST /i3x/objects/list`, not `GET /i3x/info`.** | Timebase returns 404 on `/info`. A noisy mandatory 404 at boot conditions ops to ignore startup errors; the `/objects/list` validation is the real check. |
| ElementIds preserve spaces and the `Seperator` typo: `Driftwood Historian:Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/Motor Amps`. Sent verbatim in JSON bodies — NOT URL-encoded. | These are JSON values, not URL components. Spaces are intentional; the typo is real on the historian. |
| The booleans (Running/CIP/Process) are published at **two equivalent paths simultaneously** — flat under `Edge/` and nested under `Edge/Process Values/`. `I3X_TAGS` uses the flat form; legacy `TAGS` uses the nested form; both resolve to the same live values (verified 2026-05-10). | Knowing the dual-publish reality up front prevents future confusion when someone hits `/i3x/objects` and sees the same tag listed twice. |
| Boundary points outside the requested window are **clamped to `startTime`**, not filtered out. | When upstream is sparse/stale (Phase 0 observed the Edge gateway 4h stale), Timebase returns the most-recent point as forward-fill seed. Clamping keeps the dataframe non-empty so the dashboard renders during staleness; filtering would blank the chart at the worst possible moment. **This is a deliberate operational deviation from spec, documented in `i3x_client.py`'s module docstring.** |
| The historian at `192.254.155.2:4511` is unauthenticated when reached directly. No `Authorization` header. | Traefik route at `historian.tse.prod` adds Basic auth, but we go direct. |

---

## 3.5. Wire-format divergences from 1.0-Beta spec

A reviewer familiar with the public CESMII i3X 1.0-Beta spec
(https://github.com/cesmii/i3X) will pattern-match on "i3X consumer" and
expect spec-pure code. This client is not spec-pure, on purpose:

- **Timebase 1.3 implements an i3X dialect that tracks the Alpha, not 1.0-Beta.**
  We confirmed this against live captures. Three concrete divergences:
  quality is `"GOOD"` (uppercase) not Pascal-case `"Good"`; the response
  envelope is dict-keyed by elementId, not `{success, results: [...]}`; and
  `/i3x/info` returns 404 rather than the spec-mandated capabilities document.
- **This client is pragmatic and consumer-only.** Its job is to consume what
  Timebase actually emits, not what the spec says it should emit. Tolerant
  parsers that try to handle both shapes were rejected in review on the
  grounds that dead code paths hide bugs — if Timebase ever moves to spec
  envelopes, that is a deliberate version bump and the parser failing loudly
  is the right outcome.
- **Phase 3 (the producer side, not in this branch) will be 1.0-Beta-compliant.**
  That is the right place to be spec-pure because we control the wire shape
  Rav2.21 publishes. Consuming a vendor's pre-1.0 dialect and publishing a
  current-spec one in the same process is the standard adapter pattern.

If you find yourself writing "why doesn't this look like the spec?" in PR
review, the answer is here.

---

## 4. Test inventory

**31 tests, ~31 ms, all offline.** No live HTTP, no historian dependency.

### `backend/tests/test_i3x_client.py` (24)

| Class | Test | Acceptance criterion |
|---|---|---|
| `BuildElementIdTests` | preserves spaces and "Seperator" typo | wire format |
| `IsGoodQualityTests` | `"GOOD"` passes; `Good`/`good`/whitespace/None/non-strings rejected | AC#5 (quality filter) |
| `ExtractValueResultsTests` | dict-keyed history; unrequested IDs default to empty; non-dict payload returns empty | parser contract |
| `FetchTagHistoryTests` | non-`"GOOD"` points dropped; **boundary clamp regression guard** (Phase 0 4h-stale scenario verbatim); upper bound NOT clamped | AC#5, AC#6 |
| `FetchAllTagsTests` | empty `data` → empty list per alias, never `None` | brief AC#8 |
| `FetchCurrentValuesTests` | adapter returns expected internal contract; per-tag error → None for that tag only; non-`"GOOD"` quality drops to None; **strict regression: lowercase `Good` is rejected** | AC#5 |
| `ValidateElementIdsTests` | all-present passes; missing entry raises with the named ID; `error` field counts as invalid; **dict-shape regression guard** (the bug found during smoke testing — if a future change re-conflates the per-endpoint shapes, this test fires) | AC#4 |
| `StartupTests` | `startup()` calls `_validate_element_ids` only — does NOT issue any `_post` to `/info`; propagates validation failure | AC#4 |
| `GetInfoTests` | 200 with payload; 404 → `(None, 404)`; network error → `(None, 0)`; spec result-wrapper unwrapped | diagnostic contract |

### `backend/tests/test_processing.py` (7)

| Test | Phase 2 acceptance criterion |
|---|---|
| Tick populates `LatestState` after one iteration | #1 |
| Tick appends one minute-resolution sample to ring buffer | #1 |
| Fetch failure retains last good state, marks `is_stale=True`, advances `last_updated` but not `last_good_update` | #3 |
| All-None upstream does not advance `last_good_update` | #3 |
| `current_metrics()` returns without any historian call (asserted with poison-mock dispatcher) | #2 |
| `current_metrics()` shape matches `CurrentMetrics` schema fields | contract |
| Ring buffer trims to `maxlen` | #4 |

### Test gap (not a merge blocker — recommend backfill post-merge)

The httpx layer is stubbed at the function level (`patch("services.i3x_client._post", ...)`),
not at the transport level. This means the suite proves "given a parsed
response shape, the parser does X" — but does **not** prove "the client sends
a `POST` to `/i3x/objects/list` with body `{"elementIds": [...]}` and
`Content-Type: application/json`."

Wire-format bugs hide in exactly that gap. Mitigations in place:

- Smoke test (§5) catches it the first time `USE_I3X=true`.
- The shapes the parsers consume are themselves derived from captured live
  responses, so the gap is "did we send the request right," not "did we
  understand the response."

**Recommended follow-up:** add 2–3 [`respx`](https://lundberg.github.io/respx/)-based
or `httpx.MockTransport`-based tests that assert request URL + JSON body +
`Content-Type` for `/i3x/objects/list`, `/i3x/objects/value`, and
`/i3x/objects/history`. Each ~5 ms. Locks down the wire contract that all
the parser tests assume.

---

## 5. Smoke test plan

Default `USE_I3X=false` means first deploy goes out with **no behavioral
change** — the legacy historian REST client is still in use. Flip the flag
after Step 2 confirms the i3X server is reachable.

```bash
# Step 1 — legacy still works (USE_I3X=false default)
cd ~/Rav2.21/separator-energy-dashboard
docker compose up -d --build
curl -s http://localhost:3030/health
curl -s "http://localhost:3030/api/raw?hours=1"  | jq .
curl -s http://localhost:3030/api/energy/current | jq .
# Should match pre-merge behavior. Any difference here is a refactor bug,
# NOT an i3X issue.

# Step 2 — probe the i3X server directly from outside the container
curl -s http://192.254.155.2:4511/i3x/info | jq .
# Expected: HTTP 404 (Timebase doesn't expose /info). That's normal —
# the dashboard doesn't depend on /info, only /objects/list.

# Step 3 — flip the flag in docker-compose.yml: USE_I3X=true
docker compose up -d --force-recreate
docker compose logs -f separator-dashboard | head -50
# Watch for these startup lines (in this order):
#   historian_client: using i3X 1.0-Beta backend
#   i3X startup: validated 4 configured tags
#   processing loop started (interval=5.0s, buffer=1440m, stale_after=60.0s)

# Step 4 — verify the wire path end-to-end
curl -s http://localhost:3030/api/i3x/info       | jq .   # connectivity + diagnostic
curl -s "http://localhost:3030/api/raw?hours=1"  | jq .   # elementIds + history work
curl -s http://localhost:3030/api/energy/current | jq .   # processing loop reading via i3X
curl -s http://localhost:3030/api/energy/summary | jq .   # dataframe build on the new TVQ shape
```

### Diagnostic endpoint reference

`GET /api/i3x/info` returns this shape when `USE_I3X=true`:

```json
{
  "backend": "i3x",
  "baseUrl": "http://192.254.155.2:4511",
  "dataset": "Driftwood Historian",
  "tagCount": 4,
  "upstreamInfo": null,
  "upstreamInfoStatus": 404
}
```

`upstreamInfoStatus` semantics (read this at 3am when something is broken):

- **`200`** — upstream is healthy and exposes `/info`. `upstreamInfo` is the parsed body.
- **`404`** — upstream is healthy but does not expose `/info`. **This is the expected steady state for Timebase.** The dashboard does not depend on `/info`; it's diagnostic only.
- **`0`** — upstream is unreachable at the network level (DNS failure, connection refused, timeout). `0` is a sentinel meaning "no HTTP response received," NOT a literal status code from upstream.
- Any other 4xx/5xx — upstream returned an error; `upstreamInfo` will be `null`.

When `USE_I3X=false`, the endpoint returns `404 {"detail": "i3X mode is disabled (USE_I3X=false)"}`.

### What to do if the smoke test fails

| Symptom | Likely cause | Where to look |
|---|---|---|
| Step 3 boot fails with `i3X startup validation failed ... Missing or invalid elementIds: [...]` | Configured elementId path doesn't match what's published. | Compare `I3X_TAGS` in `config.py` to the actual tree: `curl -s -X POST http://192.254.155.2:4511/i3x/objects -H 'Content-Type: application/json' -d '{}'`. Adjust `I3X_SEPARATOR_BASE_PATH` or `I3X_TAG_*` env vars. |
| Step 4 `/api/i3x/info` returns 200 but `/api/raw` returns empty arrays for all tags | Validation passed (tags exist) but history returns empty (could be stale upstream OR a deeper path issue). | Hit the historian directly: `curl -s -X POST http://192.254.155.2:4511/i3x/objects/value -H 'Content-Type: application/json' -d '{"elementIds":["Driftwood Historian:.../Motor Amps"]}'`. If that's also empty, upstream is stale (not our problem). |
| Step 4 `/api/energy/current` returns `is_stale: true` and stale `last_updated` | Processing loop running but historian not returning GOOD points. | Check `docker compose logs separator-dashboard` for `processing tick: fetch_current_values failed:` lines. |

---

## 6. Rollback

The rollback path is a single env var:

```bash
# In docker-compose.yml:
- USE_I3X=false

docker compose up -d --force-recreate
```

This switches the dispatcher to the legacy REST client. Phase 2's processing
loop continues to run — it reads through `historian_client`, which now points
at the legacy backend. `/api/energy/current` and `/api/energy/timeline` keep
serving from `LatestState`/the ring buffer.

Concretely:
- **Wire protocol:** legacy `/api/datasets/.../data` instead of `/i3x/objects/*`.
- **Quality semantics:** integer `>= MIN_GOOD_QUALITY=192` instead of string `"GOOD"`.
- **Tag paths:** legacy `TAGS` references the booleans under `Edge/Process Values/`; `I3X_TAGS` references them flat under `Edge/`. **These are equivalent views of the same underlying tags** — verified live (2026-05-10) by `POST /i3x/objects/list` and `POST /i3x/objects/value` against both path schemes returning identical Tag entries and identical values with matching millisecond timestamps. The historian publishes each boolean at both paths simultaneously, so rollback is data-equivalent, not just functionally equivalent.
- **Startup validation:** no-op. Legacy mode does not validate at boot.
- **Diagnostic endpoint:** `/api/i3x/info` returns 404 with `{"detail": "i3X mode is disabled (USE_I3X=false)"}`.
- **Dashboard behavior:** unchanged. Same JSON shapes on `/api/*`.

The legacy client was renamed (not deleted) and its config vars (`TIMEBASE_HOST`,
`TIMEBASE_PORT`, `TIMEBASE_DATASET`, `MIN_GOOD_QUALITY`) are kept in `config.py`
and the compose files specifically to make this rollback a one-line change.
**Do not remove those vars in this PR or any follow-up that doesn't explicitly
call out the rollback path being deprecated.**

---

## 7. Known gaps and follow-ups

- **Test gap (above):** transport-level request-shape assertions. Recommend
  backfill with `respx` or `httpx.MockTransport`. Not a merge blocker.
- **`MIN_GOOD_QUALITY` env var is still in config and compose** despite being
  unused on the i3X path. Kept for the rollback. Drop in Phase 6 polish.
- **`TIMEBASE_HOST`/`TIMEBASE_PORT`/`TIMEBASE_DATASET` env vars** likewise
  retained for rollback. Drop in Phase 6.
- **Phase 3 (producer-side i3X server)** has its data source ready
  (`processing.LatestState` for live values, the ring buffer for history).
  Wait for a concrete consumer before building.
- **Ring buffer is in-memory only.** Process restart loses the last 24h of
  derived signal history until the buffer fills again. Acceptable for a
  POC; if Phase 3 ships, reconsider.
- **Cost-today accumulator** uses tick-elapsed time multiplied by current kW.
  Long pauses are clamped to 6× the tick interval to prevent runaway
  accumulation. Resets on facility-local midnight. Verify the rollover
  during the smoke test by leaving the dashboard running across midnight
  US/Pacific at least once.

---

## Appendix A — File diff summary

```
NEW    backend/services/i3x_client.py             ~330 lines
NEW    backend/services/historian_client.py        ~30 lines
NEW    backend/services/processing.py             ~225 lines
NEW    backend/tests/test_i3x_client.py           ~280 lines (24 tests)
NEW    backend/tests/test_processing.py           ~145 lines  (7 tests)
NEW    backend/__init__.py                          empty
NEW    backend/tests/__init__.py                    empty
NEW    docs/phase1-shipped.md                     this file

REN    backend/services/timebase_client.py
       -> backend/services/timebase_client_legacy.py  (no edits)

EDIT   backend/config.py                          +i3X block, +Phase 2 vars
EDIT   backend/main.py                            -on_event, +lifespan, +/api/i3x/info
EDIT   backend/routers/energy.py                  historian_client + processing-backed routes
EDIT   backend/models/schemas.py                  +cost_today, last_updated, is_stale
EDIT   docker-compose.yml                         +I3X_*, +PROCESSING_*
EDIT   docker-compose.portainer.yml               +I3X_*, +PROCESSING_*
```

---

## Appendix B — Acceptance criteria mapping

From [`docs/i3x-integration.md`](./i3x-integration.md) §5:

### Phase 1

| AC | Status | Where |
|---|---|---|
| 1. `/api/raw?hours=1` returns same shape as pre-change with at least one valid point per tag | Verified by smoke test step 4 | `routers/energy.py::get_raw` |
| 2. `/api/energy/current` returns same JSON structure | Verified — `CurrentMetrics` shape preserved with three additive optional fields | `routers/energy.py::get_current` + `processing.current_metrics()` + `models/schemas.py::CurrentMetrics` |
| 3. With `USE_I3X=false`, behavior reverts to legacy client unchanged | Default in this PR; smoke test step 1 verifies | `services/historian_client.py` |
| 4. ElementId validation at startup fails loudly with clear message if tag is missing | `ValidateElementIdsTests` (4 tests) + `StartupTests` (2 tests) | `services/i3x_client.py::_validate_element_ids` |
| 5. Quality filter drops non-`"GOOD"` points | `IsGoodQualityTests` + `FetchTagHistoryTests::test_history_drops_non_good_quality_points` + `FetchCurrentValuesTests::test_lowercase_good_is_rejected` | `services/i3x_client.py::_is_good_quality` |
| 6. Boundary-point clamp test asserts adapter snaps point before `startTime` to `startTime` | `FetchTagHistoryTests::test_history_clamps_boundary_point_to_window_start` (Phase 0 scenario verbatim) | `services/i3x_client.py::_to_contract_point` |

### Phase 2

| AC | Status | Where |
|---|---|---|
| 1. App starts, processing loop runs, `LatestState` populates within one interval | `test_tick_populates_latest_state` | `services/processing.py::_tick` |
| 2. `/api/energy/current` returns in <50ms with no historian call | `test_current_metrics_returns_without_historian_call` (poison-mock dispatcher) | `routers/energy.py::get_current` |
| 3. Stopping the historian doesn't crash the app — last good state retained, `lastUpdated` field for consumers | `test_fetch_failure_retains_last_good_state` + `test_all_none_upstream_does_not_advance_last_good_update` | `services/processing.py::_tick` exception path |
| 4. Ring buffer trims to configured size; no memory leak under 24h soak | `test_ring_buffer_trims_to_max_length` (deque maxlen verified); 24h soak NOT in CI | `services/processing.py::_buffer` |
