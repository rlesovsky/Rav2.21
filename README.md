# Driftwood Separator Energy Cost Dashboard

**Client:** Driftwood Dairy — El Monte, CA  
**Built by:** Texas Automation Systems  
**Status:** POC (Proof of Concept)

Real-time energy cost dashboard for a dairy separator. Reads operational data from a TimeBase historian, classifies operating state, and applies SCE TOU-GS-2 pricing to show cost by state, shift, and day.

---

## Full Architecture

### System context (high-level)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    USER (Browser)                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            │ HTTPS (port 3000 in Docker / 5173 in dev)
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              REACT FRONTEND (Vite)                                        │
│  • Single-page dashboard                                                                  │
│  • Manual refresh only (no polling)                                                       │
│  • Recharts, Tailwind, Axios, dayjs                                                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            │ /api/* → proxy to backend
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              FASTAPI BACKEND (Python 3.11)                                │
│  • REST API on port 8000                                                                 │
│  • CORS, health check, energy + config routes                                            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            │ HTTP/JSON (GET /api/datasets/.../data)
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              TIMEBASE HISTORIAN (Plant)                                   │
│  • Host: 192.254.155.2:4511 (or env)                                                      │
│  • Dataset: Driftwood Historian                                                           │
│  • Tags: Motor Amps, Running, CIP, Process (UNS paths)                                    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Backend architecture (detail)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    backend/                                               │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  main.py                                                                                  │
│  • FastAPI app, CORS, logging                                                             │
│  • GET /health  →  { "status": "ok" }                                                    │
│  • Mounts: routers.energy                                                                 │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  config.py                                                                                │
│  • TIMEBASE_* (host, port, dataset)                                                       │
│  • TAGS (motor_amps, running, cip, process — UNS paths)                                   │
│  • VOLTAGE, POWER_FACTOR, DEFAULT_RATE_PER_KWH                                            │
│  • FACILITY_TIMEZONE, SHIFTS (1st/2nd/3rd), TOU_RATES (summer/winter)                     │
│  • All overridable via environment variables                                              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  routers/energy.py                                                                        │
│  • GET  /api/energy/current   → timebase_client + state_engine.classify_state + cost_calc │
│  • GET  /api/energy/summary   → fetch_all_tags → state_engine → cost_calculator (summary) │
│  • GET  /api/energy/daily     → fetch_all_tags → state_engine → cost_calculator (daily)   │
│  • GET  /api/energy/timeline  → fetch_all_tags (24h) → state_engine → cost_calc (timeline) │
│  • GET  /api/config          → cost_calculator.get_config()                               │
│  • POST /api/config          → cost_calculator.update_config()                            │
│  • GET  /api/raw?hours=1     → raw tag debug (point counts, first/last per tag)          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  services/timebase_client.py                                                              │
│  • fetch_tag_history(tag_path, start, end) → list[{t, v, q}]                              │
│  • fetch_all_tags(start, end) → { motor_amps: [...], running: [...], cip: [...], ... }   │
│  • fetch_current_values() → { motor_amps, running, cip, ... } (latest per tag, 2-min win)  │
│  • Parses response["tl"][0]["d"]; filters by MIN_GOOD_QUALITY                             │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  services/state_engine.py                                                                  │
│  • classify_state(cip, running) → "Processing" | "CIP" | "Shutdown"                        │
│  • build_dataframe(raw) → DataFrame indexed by UTC minute: motor_amps, running, cip,     │
│      state; boolean tags 1/0 → bool; forward-fill; resample 1 min                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  services/cost_calculator.py                                                               │
│  • get_tou_rate(ts), get_shift(ts), get_tou_period(ts) — US/Pacific, TOU_RATES, SHIFTS    │
│  • calculate_costs(df) → adds kw, kwh, cost_usd, shift, tou_period, tou_rate (per row)    │
│  • aggregate_summary(df) → by_state + by_shift                                            │
│  • aggregate_daily(df) → list of { date, by_state, by_shift }                             │
│  • aggregate_timeline(df) → list of { timestamp, kw, state, tou_period, shift, ... }      │
│  • current_cost(amps, state, tou_period, tou_rate, shift) → live snapshot                │
│  • amps_to_kw(amps) = (Amps × 460 × √3 × PF) / 1000                                       │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  models/schemas.py                                                                         │
│  • Pydantic: StateMetrics, ShiftMetrics, EnergySummary, DailyRecord, TimelinePoint,       │
│      CurrentMetrics, EnergyConfig, RawDebugResponse                                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Frontend architecture (detail)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              frontend/ (React + Vite)                                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  index.html  • Title, IBM Plex Sans font                                                  │
│  vite.config.js  • React plugin, Tailwind, proxy /api → http://localhost:8000            │
│  src/index.css  • @import "tailwindcss"                                                   │
│  src/main.jsx  • React root                                                               │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  src/App.jsx                                                                              │
│  • refreshKey state; handleRefresh() increments it and sets isRefreshing                 │
│  • onRefreshComplete() → when 8 components have finished, clear isRefreshing             │
│  • Layout: Header, LiveStatusCard, KPISummaryCards, StateCostBreakdown | ShiftCostBreakdown,│
│      CostByDayChart, EnergyTrendChart, StateTimeline, RateConfigPanel                     │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  src/api/energyApi.js                                                                     │
│  • Axios baseURL /api                                                                     │
│  • fetchCurrent(), fetchSummary(), fetchDaily(), fetchTimeline(), fetchConfig(),         │
│      updateConfig(data)                                                                   │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  src/utils/formatters.js                                                                   │
│  • formatCurrency, formatKwh, formatKw, formatHours, formatPercent, formatRate           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  src/components/                                                                          │
│  • Header.jsx         Clock (1s timer), refresh button, System Online                     │
│  • LiveStatusCard     GET /api/energy/current — state, amps, kW, $/hr, TOU, shift        │
│  • KPISummaryCards    GET /api/energy/summary — 4 cards (cost, kWh, avg $/hr, processing %)│
│  • StateCostBreakdown GET /api/energy/summary — pie + table by state                      │
│  • ShiftCostBreakdown GET /api/energy/summary — stacked bar + table by shift              │
│  • CostByDayChart     GET /api/energy/daily — stacked bar by day                          │
│  • EnergyTrendChart   GET /api/energy/timeline — area chart kW vs time                    │
│  • StateTimeline      GET /api/energy/timeline — color bar 24h state                      │
│  • RateConfigPanel    GET/POST /api/config — voltage, power factor, $/kWh (collapsible)   │
│  • InfoTooltip.jsx    (i) icon tooltips per card                                          │
│                                                                                           │
│  Each data component: refreshKey in useEffect deps; onRefreshComplete() in finally.        │
│  No setInterval; single global refresh in header.                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Data flow (single refresh)

```
User clicks Refresh
       │
       ▼
App: setRefreshKey(k+1), isRefreshing = true
       │
       ├──► LiveStatusCard    fetchCurrent()     ──► onRefreshComplete()
       ├──► KPISummaryCards   fetchSummary()    ──► onRefreshComplete()
       ├──► StateCostBreakdown fetchSummary()   ──► onRefreshComplete()
       ├──► ShiftCostBreakdown fetchSummary()   ──► onRefreshComplete()
       ├──► CostByDayChart    fetchDaily()      ──► onRefreshComplete()
       ├──► EnergyTrendChart  fetchTimeline()   ──► onRefreshComplete()
       ├──► StateTimeline     fetchTimeline()   ──► onRefreshComplete()
       └──► RateConfigPanel   fetchConfig()     ──► onRefreshComplete()
       │
       │  (Backend: each request → timebase_client.fetch_all_tags or fetch_current_values
       │   → state_engine.build_dataframe / classify_state → cost_calculator.*)
       │
       ▼
After 8 callbacks: App sets isRefreshing = false (header spinner stops)
```

### Docker deployment architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  docker compose up (separator-energy-dashboard/docker-compose.yml)                        │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  separator-backend (FastAPI)                                                             │
│  • Build: backend/Dockerfile                                                              │
│  • Expose 8000 (internal only)                                                             │
│  • Env: TIMEBASE_HOST, TIMEBASE_PORT, TOU_*, VOLTAGE, CORS_ORIGINS, etc.                  │
│  • Health: curl http://localhost:8000/health                                              │
│  • Network: industry40 (external)                                                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  separator-frontend (Nginx serving Vite build)                                            │
│  • Build: frontend/Dockerfile (npm run build → nginx)                                      │
│  • Port: 3000:80 (DASHBOARD_PORT)                                                         │
│  • Depends on: separator-backend healthy                                                   │
│  • Nginx proxies /api to separator-backend:8000                                           │
│  • Network: industry40                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech stack

| Layer     | Technologies |
|----------|--------------|
| Frontend | React 19, Vite, Tailwind CSS v4, Recharts, Axios, dayjs, lucide-react |
| Backend  | Python 3.11, FastAPI, Uvicorn, httpx, pandas, Pydantic v2, python-dotenv |
| Data     | TimeBase Historian (REST API, HTTP/JSON) |
| Deploy   | Docker, Docker Compose, Nginx |

---

## Repository structure

```
Driftwood Seperator/
├── README.md                          ← This file
├── .gitignore
├── agent-prompts/                     ← Context prompts for AI/agents
├── docs/                              ← Build plan, etc.
│
└── separator-energy-dashboard/
    ├── PROJECT_DOCUMENTATION.md        ← Detailed spec, formulas, API, run instructions
    ├── .env.example                   ← Example environment variables
    ├── docker-compose.yml             ← Backend + frontend services, industry40 network
    │
    ├── backend/
    │   ├── main.py                    ← FastAPI app entry
    │   ├── config.py                  ← Tags, TOU, shifts, electrical (env-overridable)
    │   ├── requirements.txt
    │   ├── Dockerfile
    │   ├── models/schemas.py          ← Pydantic response models
    │   ├── routers/energy.py          ← API route handlers
    │   └── services/
    │       ├── timebase_client.py     ← TimeBase REST client
    │       ├── state_engine.py        ← State classification + DataFrame build
    │       └── cost_calculator.py     ← Power, TOU, shift, aggregations
    │
    └── frontend/
        ├── package.json
        ├── vite.config.js             ← Proxy /api → backend
        ├── Dockerfile                 ← Build + Nginx
        ├── nginx.conf
        ├── index.html
        └── src/
            ├── App.jsx
            ├── index.css
            ├── main.jsx
            ├── api/energyApi.js
            ├── utils/formatters.js
            └── components/            ← Header, LiveStatusCard, KPIs, charts, etc.
```

---

## How to run

### Local development

1. **Backend** (requires VPN if TimeBase is on plant network):

   ```bash
   cd separator-energy-dashboard/backend
   python -m venv venv
   source venv/bin/activate   # or venv\Scripts\activate on Windows
   pip install -r requirements.txt
   python main.py
   ```

   Backend: http://localhost:8000  
   Health: http://localhost:8000/health

2. **Frontend**:

   ```bash
   cd separator-energy-dashboard/frontend
   npm install
   npm run dev
   ```

   Dashboard: http://localhost:5173 (Vite proxies `/api` to backend)

### Docker (production-style)

1. Create external network if needed: `docker network create industry40`
2. Copy `.env.example` to `.env` and set `TIMEBASE_HOST` (and others) as needed
3. From `separator-energy-dashboard/`:

   ```bash
   docker compose up -d --build
   ```

   Dashboard: http://&lt;host&gt;:3000 (port configurable via `DASHBOARD_PORT`)

---

## Environment variables (summary)

| Variable | Default | Description |
|----------|---------|-------------|
| TIMEBASE_HOST | 192.254.155.2 | TimeBase historian host |
| TIMEBASE_PORT | 4511 | TimeBase port |
| TIMEBASE_DATASET | Driftwood Historian | Dataset name |
| FACILITY_TIMEZONE | US/Pacific | For shifts and TOU |
| DEFAULT_RATE_PER_KWH | 0.30 | Flat fallback $/kWh |
| VOLTAGE | 460 | 3-phase voltage |
| POWER_FACTOR | 0.88 | Motor power factor |
| CORS_ORIGINS | localhost:5173,... | Allowed frontend origins |
| TOU_SUMMER_* / TOU_WINTER_* | (see .env.example) | TOU rate overrides |
| DASHBOARD_PORT | 3000 | Host port for frontend in Docker |

Full list and defaults: see `separator-energy-dashboard/.env.example`.

---

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/energy/current` | Live amps, kW, $/hr, state, TOU period, shift |
| GET | `/api/energy/summary` | 7-day totals by state and by shift |
| GET | `/api/energy/daily` | Per-day breakdown (7 days), by state and shift |
| GET | `/api/energy/timeline` | Last 24 h, per-minute kW, state, TOU, shift |
| GET | `/api/config` | Current rate, voltage, power factor |
| POST | `/api/config` | Update rate, voltage, power factor |
| GET | `/api/raw?hours=1` | Debug: raw tag point counts and sample points |

---

## Operating states & TOU

- **States (3):** **Processing** (running, not CIP), **CIP** (clean-in-place), **Shutdown** (not running).  
  Derived from tags: **Motor Amps**, **Running**, **CIP**.

- **TOU:** SCE TOU-GS-2 placeholder rates; summer (Jun–Sep) and winter (Oct–May); On-Peak / Mid-Peak / Off-Peak / Super Off-Peak by time of day and weekday/weekend. All times US/Pacific.

- **Shifts:** 1st 6:00–14:00, 2nd 14:00–22:00, 3rd 22:00–6:00 (local).

For formulas, tag paths, and detailed behavior see **separator-energy-dashboard/PROJECT_DOCUMENTATION.md**.
