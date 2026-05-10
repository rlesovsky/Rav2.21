# Driftwood Separator Energy Dashboard

**Client:** Driftwood Dairy — El Monte, CA
**Built by:** Texas Automation Systems
**Status:** POC — running. Phases 1, 2, 3 v1 shipped on `feat/i3x-consumer-client`.

Real-time energy cost dashboard for a dairy separator. Reads operational data from the Driftwood Timebase historian over its i3X-flavored API, classifies operating state, applies SCE TOU-GS-2 pricing, and serves both:

1. **A React dashboard** for operators and managers (live status, cost breakdowns, daily trends, configurable window)
2. **A 1.0-compliant i3X producer** at `/api/i3x/v1/*` so other applications (Grafana, MES, MCP/Claude tools, ACE Explorer) can consume Rav2.21's derived signals

---

## Architecture

```
                Other i3X clients (Grafana, MES, MCP, ACE Explorer)
                                  │
                                  ▼  /api/i3x/v1/*
   ┌───────────────────────────────────────────────────────────────────┐
   │  i3X PRODUCER (backend/i3x_server/)                               │
   │  /info /namespaces /objecttypes /relationshiptypes                │
   │  /objects /objects/list /objects/related                          │
   │  /objects/value (LatestState)   /objects/history (ring buffer +   │
   │                                  historian fallback for raw tags) │
   └───────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼ in-process function calls
   ┌───────────────────────────────────────────────────────────────────┐
   │  PROCESSING LOOP (backend/services/processing.py)                 │
   │  Background tick every 5s: pulls live values, classifies state,   │
   │  computes kW/$/hr/$today/TOU/shift, writes to LatestState +       │
   │  appends to 24h ring buffer (1-min resolution).                   │
   │  Buffer pre-filled from historian at boot.                        │
   └───────────────────────────────┬───────────────────────────────────┘
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       │                           │                           │
       ▼ /api/energy/current       ▼ historian fetch           ▼ /api/i3x/v1/*
   ┌───────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
   │  ANALYTICS    │  │  CONSUMER CLIENT     │  │  ANALYTICS CACHE     │
   │  CACHE        │  │  (Phase 1)           │  │  pre-warm + TTL      │
   │  /summary     │  │  i3x_client.py +     │  │                      │
   │  /daily       │  │  historian_client    │  │                      │
   │  with WoW     │  │  dispatcher          │  │                      │
   │  deltas       │  └──────────────────────┘  └──────────────────────┘
   └───────────────┘                  │
                                      ▼  POST /i3x/objects/{value,history,list}
                       Timebase Historian (192.254.155.2:4511)
```

Single FastAPI process, single Docker container. Dashboard consumes its own `/api/energy/*` endpoints; external i3X clients consume `/api/i3x/v1/*`. Both are served from the same app.

---

## What's running

### Frontend — React + Vite + Tailwind v4 + Recharts

- **Live tab:** 7 mini cards (Operating state + Amps/kW/$ per hr/TOU period/TOU rate/Shift) above a 24-hour state distribution and a full-height Power draw area chart
- **Analysis tab:** window selector (7d / 30d), 5 KPI cards with week-over-week deltas (cost, energy, avg $/hr, processing %, peak hours cost %), donut + stacked bars + daily breakdown
- Pure black background, hairline-bordered cards (MaestroHub-inspired), tabular nums
- Auto-polls live data every 5s; relative "Updated Xs ago" timestamps

### Backend — FastAPI on Python 3.11

- **`/api/energy/*`** — dashboard data (current, summary, daily, timeline, raw, config)
- **`/api/i3x/v1/*`** — i3X producer endpoints
- **`/api/i3x/info`** — diagnostic for the upstream i3X consumer (separate from the producer's `/info`)
- **`/health`** — liveness probe

### Background services

- **Processing loop** (`services/processing.py`) — 5s tick, in-memory `LatestState` + 24h ring buffer
- **Analytics prewarm** (`services/analytics.py`) — refreshes 7d + 30d summary/daily caches every 4 minutes
- **i3X consumer client** (`services/i3x_client.py`) — talks to Timebase's i3X API behind a `USE_I3X` flag; legacy REST fallback at `services/timebase_client_legacy.py`

---

## Quick start (local dev on Mac)

Backend (Python 3.11+, deps already installed system-wide for this repo):

```bash
cd separator-energy-dashboard/backend
USE_I3X=true python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd separator-energy-dashboard/frontend
npm install   # first time only
npm run dev   # serves at http://localhost:5173
```

Open **http://localhost:5173** — Vite proxies `/api/*` to the backend on `localhost:8000`.

Smoke-test the i3X producer:

```bash
curl -s http://localhost:8000/api/i3x/v1/info | jq .
curl -s http://localhost:8000/api/i3x/v1/objects | jq '.result | length'   # 12
curl -s -X POST http://localhost:8000/api/i3x/v1/objects/value \
  -H 'Content-Type: application/json' \
  -d '{"elementIds":["separator-1-state","separator-1-kw","separator-1-cost-today"]}' | jq .
```

---

## Production deployment

GitHub Actions workflow `.github/workflows/build-dashboard-images.yml` builds two `linux/amd64` images (`separator-backend`, `separator-frontend`) and exports them as `separator-dashboard-images.tar`.

```bash
# 1. Trigger a build and download the artifact
gh workflow run "Build dashboard images" --ref main
gh run watch
gh run download <run-id> --name separator-dashboard-images

# 2. SCP to the production Linux server
scp separator-dashboard-images.tar user@server:/tmp/

# 3. On the server, load and start
docker load -i /tmp/separator-dashboard-images.tar
cd /path/to/repo/separator-energy-dashboard
docker compose -f docker-compose.portainer.yml up -d
```

Smoke test on the server:

```bash
curl http://<server>:3030/health
curl http://<server>:3030/api/i3x/v1/info | jq .
curl http://<server>:3030/api/energy/current | jq .
```

The server exposes the React dashboard at `http://<server>:3030` and the i3X producer at `http://<server>:3030/api/i3x/v1/`.

---

## Configuration (env vars)

All set via `docker-compose.yml` / `.portainer.yml`. Notable ones:

| Variable | Default | Purpose |
|---|---|---|
| `USE_I3X` | `false` | `true` uses i3X consumer; `false` uses legacy REST historian client |
| `I3X_BASE_URL` | `http://192.254.155.2:4511` | Upstream historian base URL |
| `I3X_DATASET` | `Driftwood Historian` | Timebase dataset name |
| `I3X_SEPARATOR_BASE_PATH` | `Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge` | Tag-tree path under the dataset |
| `I3X_TAG_*` | `Motor Amps`/`Running`/`CIP`/`Process` | Tag names |
| `PROCESSING_INTERVAL_SECONDS` | `5` | Background tick interval |
| `PROCESSING_BUFFER_MINUTES` | `1440` | Ring-buffer size (24h × 60min) |
| `STALE_THRESHOLD_SECONDS` | `60` | When to flag `is_stale` on LatestState |
| `DEFAULT_RATE_PER_KWH` | `0.30` | Flat fallback rate when TOU lookup fails |
| `TOU_*` | various | SCE TOU-GS-2 tier rates |
| `FACILITY_TIMEZONE` | `US/Pacific` | For shift + TOU + cost_today midnight |

---

## Tests

```bash
cd separator-energy-dashboard/backend
python3 -m unittest discover -s . -p "test_*.py"
```

**64 tests, ~90 ms, all offline:**
- `tests/test_i3x_client.py` (24) — consumer wire format, quality filter, boundary clamp
- `tests/test_processing.py` (7) — Phase 2 acceptance criteria
- `i3x_server/tests/test_envelope.py` (12) — producer wire shape regression guards
- `i3x_server/tests/test_model.py` (8) — catalog integrity
- `i3x_server/tests/test_routes.py` (11) — producer endpoint happy path + errors

---

## Documentation index

| Doc | Purpose |
|---|---|
| [`docs/i3x-integration.md`](./docs/i3x-integration.md) | Architectural plan + phasing. Source of truth for what we're building toward. |
| [`docs/phase1-shipped.md`](./docs/phase1-shipped.md) | Phase 1 (consumer) + Phase 2 (processing) manifest |
| [`docs/phase3-shipped.md`](./docs/phase3-shipped.md) | Phase 3 v1 (i3X producer) manifest |
| [`docs/phase3-producer-plan.md`](./docs/phase3-producer-plan.md) | Original Phase 3 plan with reference-server captures (Appendix C) |
| [`docs/BUILD_PLAN.md`](./docs/BUILD_PLAN.md) | **Historical** — Feb 2026 original build plan (superseded but kept for context) |
| [`separator-energy-dashboard/PROJECT_DOCUMENTATION.md`](./separator-energy-dashboard/PROJECT_DOCUMENTATION.md) | **Historical** — pre-i3X architecture writeup (superseded but kept for context) |
| [`separator-energy-dashboard/DOCKER.md`](./separator-energy-dashboard/DOCKER.md) | Docker / Portainer deploy notes |
| [`agent-prompts/`](./agent-prompts/) | Historical role prompts for project orchestration |

---

## What's done, what's next

**Done (on `feat/i3x-consumer-client`):**
- ✅ Phase 1 — i3X consumer behind `USE_I3X` flag
- ✅ Phase 2 — continuous processing service (LatestState + 24h ring buffer)
- ✅ Phase 3 v1 — i3X producer at `/api/i3x/v1/*` (all endpoints except subscriptions)
- ✅ Frontend refactor — tabs, window selector, WoW deltas, peak-hours KPI
- ✅ Backend caching + pre-warm — 30-day window <10ms after first ~25s prewarm
- ✅ CI — GitHub Actions workflow building amd64 images, exporting `.tar` artifact

**Deferred / open:**
- Phase 4 — subscriptions (SSE). ~3 days of work; defer until a real subscriber asks.
- Persistent history beyond 24h for derived signals (today they cap at the in-memory ring buffer)
- ISA-95 type alignment for the producer's catalog (currently using custom types in our namespace)
- Multi-separator support (currently single instance hardcoded in `i3x_server/model.py`)

See [`docs/phase3-shipped.md`](./docs/phase3-shipped.md) §11 for the full deferred list.
