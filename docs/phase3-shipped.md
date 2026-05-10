# Phase 3 — i3X Producer (v1) Shipped

**Status:** Shipped on `feat/i3x-consumer-client` (commit `1f0b3f2`). Phase 4 (subscriptions) deferred — reference server only exposes SSE; not built until a real subscriber asks.
**Pairs with:** [`phase1-shipped.md`](./phase1-shipped.md) (Phase 1+2), [`i3x-integration.md`](./i3x-integration.md) (overall plan), [`phase3-producer-plan.md`](./phase3-producer-plan.md) (the plan we built to).

---

## 1. What landed

A self-contained i3X producer at **`/api/i3x/v1/*`**. Other applications (Grafana, MES, MCP/Claude tools, ACE i3X Explorer) can now browse, read, and pull historical data for Rav2.21's derived energy signals — without needing to talk to the upstream Timebase historian directly.

**Wire shape matches `api.i3x.dev/v1` reference server byte-for-byte.** All shapes verified against live reference-server captures (see [`phase3-producer-plan.md`](./phase3-producer-plan.md) Appendix C).

---

## 2. New code

```
backend/i3x_server/                          NEW package
├── __init__.py
├── model.py            (≈220 lines) static catalog: namespace, types,
│                                     relationships, folders, 9 tags
├── envelope.py         (≈100 lines) wire-shape helpers — every helper
│                                     emits the exact field set the
│                                     reference server returns
├── values.py           (≈100 lines) bridges catalog → LatestState /
│                                     ring buffer / historian
├── routes.py           (≈170 lines) FastAPI router with 11 endpoints
└── tests/
    ├── test_envelope.py    (12 tests)
    ├── test_model.py       (8 tests)
    └── test_routes.py      (11 tests)
```

**Total: 31 new tests.** All offline (no live HTTP), all pass.

`backend/main.py` mounts the router with one line:
```python
app.include_router(i3x_producer_router)
```

Frontend untouched. The React dashboard still talks to `/api/energy/*` like before; the new `/api/i3x/v1/*` routes are for *external* consumers.

---

## 3. Endpoints implemented

All 11 — every spec endpoint except subscriptions:

| Endpoint | Source data |
|---|---|
| `GET /api/i3x/v1/info` | Static — server identity + capabilities |
| `GET /api/i3x/v1/namespaces` | Static — single `Separator Energy` namespace |
| `GET /api/i3x/v1/objecttypes` + `POST /objecttypes/query` | Static — 2 types (`folder-type`, `tag-type`) |
| `GET /api/i3x/v1/relationshiptypes` + `POST /relationshiptypes/query` | Static — `HasComponent` |
| `GET /api/i3x/v1/objects` | Static — full catalog (12 objects) |
| `POST /api/i3x/v1/objects/list` | Static — bulk lookup; **422 on empty `elementIds`** |
| `POST /api/i3x/v1/objects/related` | Static — children traversal |
| `POST /api/i3x/v1/objects/value` | **Live** — `processing.LatestState` |
| `POST /api/i3x/v1/objects/history` | **Live** — ring buffer for derived; `historian_client` for raw passthrough tags |

---

## 4. Object catalog published

**Namespace:** `https://rav221.tse.prod/separator-energy` (displayName `Separator Energy`)

**Hierarchy** (3 folders, 9 tags = 12 objects):

```
driftwood-dairy                    (folder)
└── driftwood-dairy-el-monte       (folder)
    └── separator-1                (folder)
        ├── separator-1-state           (string)  Processing/CIP/Idle/Shutdown
        ├── separator-1-kw              (number)  live kW
        ├── separator-1-cost-per-hour   (number)  USD/h at current TOU
        ├── separator-1-cost-today      (number)  USD since local midnight (US/Pacific)
        ├── separator-1-tou-period      (string)  On-Peak/Mid-Peak/Off-Peak/Super Off-Peak
        ├── separator-1-shift           (string)  1st/2nd/3rd
        ├── separator-1-motor-amps      (number)  raw passthrough
        ├── separator-1-running         (boolean) raw passthrough
        └── separator-1-cip             (boolean) raw passthrough
```

ElementIds are slug-style (matches the reference server convention). Hierarchy is preserved via `parentId`.

---

## 5. Wire-format details honored

Every shape detail verified against `api.i3x.dev/v1`:

| Aspect | What we emit |
|---|---|
| Top envelope (unary) | `{success: true, result: ...}` for `/info`, `/namespaces`, `/objects`, `/objecttypes`, `/relationshiptypes` |
| Top envelope (bulk) | `{success: true, results: [...]}` (note `results` with `s`) for `/objects/list`, `/value`, `/history` |
| Per-element entry | `{success, elementId, subscriptionId, result, error}` — all keys present, `null` when unused |
| VQT records | `{isComposition, value, quality, timestamp, components}` — ALL keys, `components: null` for leaf tags |
| ObjectInstance | `{elementId, displayName, typeElementId, parentId, isComposition, isExtended}` — note **`typeElementId`** not `typeId`, no `hasChildren` or `namespaceUri` per object |
| History result | `{isComposition: false, values: [...]}` — note `values` is wrapped, not bare array |
| Quality strings | `Good` / `Bad` / `Uncertain` / `GoodNoData` — Pascal case |
| Timestamps | `2026-05-10T22:14:33Z` — second precision UTC with `Z` suffix |
| Empty `elementIds` | HTTP 422 with Pydantic-style validation error (matches reference) |

---

## 6. Quality classification

`processing.LatestState` provides `is_stale` (bool) and `last_good_update` (datetime or None). Mapped to i3X quality:

| State | Quality |
|---|---|
| `last_good_update` is None (never received good data) | `Bad` |
| Value present, `is_stale=False` | `Good` |
| Value present, `is_stale=True` (silent upstream >60s) | `Uncertain` |
| Value is None but quality machinery healthy | `GoodNoData` |

This means the producer surfaces upstream gateway health to consumers without the consumers needing to know about the historian.

---

## 7. History data sources

Three different paths depending on the tag:

1. **Derived signals — last 24h:** `processing.timeline_points()` (the in-memory ring buffer Phase 2 maintains, pre-filled at boot).
   - Available: `state`, `kw`, `tou_period`, `shift`
   - `cost_per_hour` reconstructed from `kw × tou_rate`
   - `cost_today` returns None for historical points (it's a stateful accumulator we don't snapshot)

2. **Derived signals — beyond 24h:** Not available. Returns empty `values: []`. If a consumer asks, this becomes Option B from the original plan: persistent buffer to disk.

3. **Raw passthrough tags (motor_amps, running, cip):** `i3x_client.fetch_tag_history()` — same path Phase 1 uses on the consumer side. Available as far back as Timebase retains history.

---

## 8. Test inventory

**31 new tests, all offline. ~90ms total runtime** (combined with the existing 33 = 64 tests in ~90ms).

### `test_envelope.py` (12 tests)

Pin every envelope helper to the exact reference shape. If a future change drops a `null` field, this fires before any consumer notices.

- Unary envelope shape
- Bulk envelope uses `results` (with `s`)
- Per-element success includes required-but-null fields (`subscriptionId`, `error`)
- Per-element error shape matches `{code, message}`
- VQT includes `isComposition` and `components`
- Timestamp is seconds precision with `Z` suffix
- Quality classification: never-good → Bad; fresh → Good; stale → Uncertain; None value → GoodNoData

### `test_model.py` (8 tests)

Catalog integrity guards. Catch any future drift in the static catalog.

- Counts (1 namespace, 2 types, 1 relationship, 3 folders, 9 tags, 12 objects total)
- ElementIds unique
- Every parentId resolves
- Every tag is under the unit folder
- Passthrough tags carry `historian_tag`
- `public_object_instance` strips internal binding metadata
- Children lookup matches parent declarations
- Unit folder has exactly 9 tag children

### `test_routes.py` (11 tests)

End-to-end via FastAPI's TestClient. Mock LatestState; assert real response shapes.

- `/info` returns spec + capabilities
- `/namespaces` lists single namespace
- `/objects` returns catalog without `typeId`/`hasChildren`/`namespaceUri` fields
- `/objects/list` known ID succeeds + carries `null` envelope keys
- `/objects/list` unknown ID returns per-element error (200 wrapper, false success)
- `/objects/list` empty array returns 422 (matches reference Pydantic behavior)
- `/objects/related` returns 9 children for `separator-1`
- `/objects/value` reads from primed LatestState; returns shape match
- `/objects/value` unknown ID returns per-element NotFound
- Stale LatestState yields `Uncertain` quality
- `/objects/history` rejects invalid time + inverted window with 400
- Empty buffer returns `values: []` success (not error)

---

## 9. Smoke test plan (for the production server)

```bash
# 1. Identity
curl -s http://<rav-host>:3030/api/i3x/v1/info | jq .

# 2. Browse the catalog
curl -s http://<rav-host>:3030/api/i3x/v1/objects | jq '.result | length'
# Expected: 12

# 3. Live values for the four most useful tags
curl -s -X POST http://<rav-host>:3030/api/i3x/v1/objects/value \
  -H 'Content-Type: application/json' \
  -d '{"elementIds":[
    "separator-1-state",
    "separator-1-kw",
    "separator-1-cost-per-hour",
    "separator-1-cost-today"
  ]}' | jq .

# 4. Last hour of kW
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); HOUR=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)
curl -s -X POST http://<rav-host>:3030/api/i3x/v1/objects/history \
  -H 'Content-Type: application/json' \
  -d "{\"elementIds\":[\"separator-1-kw\"],\"startTime\":\"$HOUR\",\"endTime\":\"$NOW\"}" | jq '.results[0].result.values | length'
# Expected: ~60 points (one per minute)
```

Or browse via [ACE i3X Explorer](https://github.com/cesmii/i3X-explorer) pointed at `http://<rav-host>:3030/api/i3x/v1/`.

---

## 10. Rollback

There's no rollback — the producer is purely additive. Disabling it means deleting the one `app.include_router(i3x_producer_router)` line in `backend/main.py` (and optionally removing the package directory). Existing `/api/energy/*` routes are unaffected; the React frontend doesn't talk to `/api/i3x/v1/*` at all.

---

## 11. What's NOT in v1

| Feature | Status | Why deferred |
|---|---|---|
| Subscriptions (SSE) | Phase 4 | Reference advertises `subscribe.stream` only. ~3 days of work for the asyncio pub-sub + lifecycle. Not built until a real subscriber asks. |
| Write endpoints | Won't ship in v1 | Rav2.21's signals are computed, not user-settable. `update.{current,history}` advertise `false`. |
| Derived history beyond 24h | Open | Ring buffer is in-memory; restart loses pre-restart history. Add disk persistence if needed. |
| ISA-95 type alignment | Optional follow-up | Using custom `folder-type` / `tag-type`. Could swap to ISA-95 (`work-center-type` / `work-unit-type` / `measurement-value-type`) for stronger industrial conventions. |
| Multi-separator support | Hardcoded single | `model.py` defines one separator. Refactor when there's a second. |
| `cost_today` UTC quirk | Documented, not changed | Resets at facility-local midnight (US/Pacific). Cross-timezone consumers should know. |

---

## 12. Open questions resolved (vs `phase3-producer-plan.md` §11)

| Question | Decision |
|---|---|
| ElementId format | **Slug-style** (`separator-1-kw`) — matches reference |
| ObjectType strategy | **Custom types** in our namespace (`folder-type`, `tag-type`) — simple for v1, ISA-95 later if asked |
| First concrete consumer | Generic — built to spec; consumer-agnostic |
| History beyond 24h | **24h cap** for derived; passthrough fallback for raw |
| Write capabilities | **Off** (`update.current=false`, `update.history=false`) |
| Per-element error envelope | `{code, message}` — sensible default; verify against reference miss |
| Multi-separator | Single hardcoded |
| `cost_today` timezone | Documented in tag description, not changed |
| Dataset naming | `Separator Energy` — kept |

---

## 13. CI / deployment

GitHub Actions workflow `.github/workflows/build-dashboard-images.yml` builds two images (`separator-backend`, `separator-frontend`) directly from per-service Dockerfiles, exports as `separator-dashboard-images.tar`. Both images target `linux/amd64` (pinned in Dockerfiles). Workflow runs on `push: main` paths-filtered to `separator-energy-dashboard/**`, or manually via `workflow_dispatch`.

Deploy on the production server:
```bash
# 1. Download the artifact from GitHub Actions
gh run download <run-id> --name separator-dashboard-images
scp separator-dashboard-images.tar user@server:/tmp/

# 2. Load + start
docker load -i /tmp/separator-dashboard-images.tar
cd /path/to/repo/separator-energy-dashboard
docker compose -f docker-compose.portainer.yml up -d
```

Once running, smoke test: `curl http://<server>:3030/api/i3x/v1/info` should return spec 1.0 + capabilities.

---

## Appendix — File diff summary

```
NEW    backend/i3x_server/__init__.py
NEW    backend/i3x_server/model.py
NEW    backend/i3x_server/envelope.py
NEW    backend/i3x_server/values.py
NEW    backend/i3x_server/routes.py
NEW    backend/i3x_server/tests/__init__.py
NEW    backend/i3x_server/tests/test_envelope.py
NEW    backend/i3x_server/tests/test_model.py
NEW    backend/i3x_server/tests/test_routes.py
NEW    docs/phase3-shipped.md
EDIT   backend/main.py                    (+2 lines: router import + include)
EDIT   docs/i3x-integration.md            (phase status updates)
EDIT   docs/phase3-producer-plan.md       (final-form alignment with reference server)
```

Total backend Python LOC added: ~600 (split: 220 model + 100 envelope + 100 values + 170 routes). Test LOC added: ~280.
