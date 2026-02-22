# Separator Energy Cost Dashboard — Build Plan

**Client:** Driftwood Dairy — El Monte, CA  
**Separator:** Unit 1, Raw Side  
**Developer:** Texas Automation Systems / Randy Lesovsky  
**Date:** February 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Scope — Phase 1 (Energy Cost)](#2-scope--phase-1-energy-cost)
3. [Data Layer](#3-data-layer)
4. [Application Architecture](#4-application-architecture)
5. [FastAPI Endpoints](#5-fastapi-endpoints)
6. [React Dashboard Layout](#6-react-dashboard-layout)
7. [Build Phases](#7-build-phases)
8. [Configuration Reference](#8-configuration-reference)
9. [Immediate Next Steps](#9-immediate-next-steps)

---

## 1. Project Overview

Python-based Separator Energy Cost Dashboard for Driftwood Dairy's El Monte, CA facility. The application connects to the existing TimeBase historian via REST API, classifies separator operating states from UNS tag data, computes real energy costs in dollars, and presents a 7-day cost breakdown by operating state in a React web dashboard.

| Item | Detail |
|------|--------|
| Client | Driftwood Dairy — El Monte, CA |
| Separator | Unit 1, Raw Side |
| Data Source | TimeBase Historian (REST API) |
| Energy Provider | Southern California Edison (SCE) |
| Rate Class | TOU-GS-2 (Commercial 20–200 kW demand) |
| Estimated Rate | $0.28–$0.32/kWh blended (configurable in app) |
| Analysis Window | Rolling 7-day lookback |
| Backend | Python + FastAPI |
| Frontend | React + Recharts + Tailwind CSS |
| Developer | Texas Automation Systems |

---

## 2. Scope — Phase 1 (Energy Cost)

### 2.1 In Scope

- Pull 7 days of historian data for 6 separator tags via TimeBase REST API
- Classify every timestamp into one of four operating states
- Calculate real-time kW from Motor Amps using 3-phase power formula
- Compute energy cost in dollars per state, per day, and per hour
- Display results in a React dashboard with live refresh
- Configurable $/kWh rate input in the dashboard UI

### 2.2 Out of Scope (Future Phases)

- Water consumption cost
- CIP chemical cost
- Shoot cycle cost analysis
- Maintenance / oil cost modeling
- SCE demand charge optimization

---

## 3. Data Layer

### 3.1 Source Tags (UNS → TimeBase Historian)

| Tag Name | UNS Path Segment | Type | Purpose |
|----------|-----------------|------|---------|
| Motor Amps | `.../Edge/Motor Amps` | Float | Power calculation driver |
| Running | `.../Edge/Running` | Boolean | Machine is powered and spinning |
| CIP | `.../Edge/CIP` | Boolean | CIP cycle active |
| Process | `.../Edge/Process Values/Process` | Boolean | Processing mode active |
| Stand By | `.../Edge/Process Values/Stand By` | Boolean | Idle / standby mode |
| Feed Flowrate | `.../Edge/Process Values/Feed Flowrate` | Float | Confirms feed is flowing |

**Full UNS base path:**
```
Driftwood Dairy/El Monte CA/Raw Side/Separator/1/Edge/
```

### 3.2 Historian Query Strategy

- **Motor Amps / Feed Flowrate:** 1-minute aggregated samples
- **Boolean tags (Running, CIP, Process, StandBy):** On-change
- **Time window:** `NOW - 7 days` → `NOW`
- **Response format:** JSON array of `{timestamp, value}` objects
- **Fetch strategy:** All 6 tags in parallel async calls at startup and on refresh

### 3.3 Power Calculation Formula

Three-phase motor power from current measurement:

```
kW = (Motor_Amps × Voltage × √3 × Power_Factor) / 1000

Default values:
  Voltage       = 460 V (3-phase)
  Power_Factor  = 0.88
  √3            = 1.732

Example at 47A observed:
  47 × 460 × 1.732 × 0.88 / 1000 = 33.0 kW
```

### 3.4 State Detection Logic

Each 1-minute interval is classified into exactly one state using priority-ordered logic:

```python
def classify_state(cip, running, process, standby, feed_flowrate):
    if cip:
        return 'CIP'
    elif running and process and feed_flowrate > 0:
        return 'Processing'
    elif running and standby:
        return 'Idle'
    elif not running:
        return 'Shutdown'
    else:
        return 'Unknown'
```

### 3.5 Expected kW by State

| State | Typical Amps | Estimated kW | $/hr @ $0.30/kWh |
|-------|-------------|--------------|-----------------|
| Processing | 43–47A | 30.2–33.0 kW | $9.06–$9.90 |
| CIP | ~35–40A | ~24.6–28.1 kW | $7.38–$8.43 |
| Idle / Standby | ~20–25A | ~14.1–17.6 kW | $4.23–$5.28 |
| Shutdown | ~3–5A | ~2.1–3.5 kW | $0.63–$1.05 |

---

## 4. Application Architecture

### 4.1 Project File Structure

```
separator-energy-dashboard/
├── backend/
│   ├── main.py                   # FastAPI app entry point
│   ├── config.py                 # Tag names, TimeBase URL/auth, rate defaults
│   ├── routers/
│   │   └── energy.py             # All API route handlers
│   ├── services/
│   │   ├── timebase_client.py    # TimeBase REST API calls
│   │   ├── state_engine.py       # State classification logic
│   │   └── cost_calculator.py    # kW and dollar cost calculations
│   ├── models/
│   │   └── schemas.py            # Pydantic response models
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── CostSummaryCards.jsx    # Top KPI cards
│   │   │   ├── StateCostBreakdown.jsx  # Stacked cost by state
│   │   │   ├── EnergyTrendChart.jsx    # kW over time line chart
│   │   │   ├── CostByDayChart.jsx      # 7-day daily cost bars
│   │   │   ├── StateTimeline.jsx       # Color-coded state bar
│   │   │   └── RateConfigPanel.jsx     # $/kWh + voltage + PF inputs
│   │   ├── api/
│   │   │   └── energyApi.js            # Axios calls to FastAPI
│   │   └── utils/
│   │       └── formatters.js           # Currency, kWh, time formatters
│   ├── package.json
│   └── tailwind.config.js
│
└── docker-compose.yml
```

### 4.2 Data Flow

```
TimeBase Historian (REST API)
        ↓
  timebase_client.py
  [Fetches 7 days of 6 tags in parallel]
        ↓
  state_engine.py
  [Classifies each 1-min interval: Processing / CIP / Idle / Shutdown]
        ↓
  cost_calculator.py
  [kW per interval → kWh → $ cost, aggregated by state/day/hour]
        ↓
  FastAPI endpoints (JSON)
        ↓
  React Dashboard (Recharts + Tailwind)
```

### 4.3 State Color Coding

| State | Color | Hex |
|-------|-------|-----|
| Processing | Green | `#22C55E` |
| CIP | Blue | `#3B82F6` |
| Idle / Standby | Amber | `#F59E0B` |
| Shutdown | Gray | `#6B7280` |
| Unknown | Red | `#EF4444` |

---

## 5. FastAPI Endpoints

| Method | Endpoint | Description | Refresh |
|--------|----------|-------------|---------|
| `GET` | `/api/energy/summary` | Total 7-day cost + kWh by state | 5 min |
| `GET` | `/api/energy/daily` | Cost per day broken down by state (7 rows) | 5 min |
| `GET` | `/api/energy/timeline` | Hourly kW + state + cost (last 24 hrs) | 5 min |
| `GET` | `/api/energy/current` | Live: current amps, kW, $/hr right now | 30 sec |
| `GET` | `/api/config` | Current rate and electrical settings | On demand |
| `POST` | `/api/config` | Update $/kWh, voltage, power factor | On demand |

### Sample Response — `/api/energy/summary`

```json
{
  "period": "2026-02-14 to 2026-02-21",
  "rate_per_kwh": 0.30,
  "total_cost_usd": 847.32,
  "total_kwh": 2824.4,
  "by_state": {
    "Processing": { "hours": 58.2, "kwh": 1920.6, "cost_usd": 576.18 },
    "CIP":        { "hours": 8.4,  "kwh": 226.8,  "cost_usd": 68.04  },
    "Idle":       { "hours": 76.5, "kwh": 650.3,  "cost_usd": 195.09 },
    "Shutdown":   { "hours": 25.0, "kwh": 26.7,   "cost_usd": 8.01   }
  }
}
```

---

## 6. React Dashboard Layout

```
┌───────────────────────────────────────────────────────────┐
│  SEPARATOR ENERGY COST DASHBOARD   [SCE TOU-GS-2]         │
├───────────┬───────────┬─────────────┬─────────────────────┤
│ 7-Day $   │ Total kWh │  Avg $/hr   │  NOW: kW  |  $/hr   │
│ $847.32   │ 2,824 kWh │   $5.05     │  33.0kW   |  $9.90  │
├───────────┴───────────┴─────────────┴─────────────────────┤
│  COST BY STATE  (7-day stacked bar)                        │
│  ███ Processing  ░░░ CIP  ▒▒▒ Idle  ... Shutdown          │
├───────────────────────────────────────────────────────────┤
│  DAILY COST BREAKDOWN  (7-day bar, segmented by state)     │
├───────────────────────────────────────────────────────────┤
│  POWER DRAW TREND  (24-hr line chart, colored by state)    │
├───────────────────────────────────────────────────────────┤
│  STATE TIMELINE  (24-hr color-coded horizontal bar)        │
├───────────────────────────────────────────────────────────┤
│  RATE CONFIG  [$/kWh: 0.30]  [Voltage: 460]  [PF: 0.88]  │
└───────────────────────────────────────────────────────────┘
```

---

## 7. Build Phases

### Phase 1 — Backend Core
- Set up FastAPI project skeleton with `config.py` and `requirements.txt`
- Build `timebase_client.py`: connect to TimeBase REST API, fetch 7 days of all 6 tags
- Add `/api/raw` debug endpoint to validate raw data is returning correctly
- Unit test with known date ranges before building calculations

### Phase 2 — Calculation Engine
- Build `state_engine.py` with `classify_state()` function
- Build `cost_calculator.py`: `amps_to_kw()`, `calculate_cost()`, `aggregate_by_state()`, `aggregate_by_day()`
- Build all 5 production endpoints with real aggregated data
- Validate with Postman or curl before touching the frontend

### Phase 3 — React Frontend
- Scaffold React app with Vite + Tailwind
- Build `energyApi.js` Axios client connecting to FastAPI
- Build KPI summary cards (validates API connection first)
- Add Recharts: daily cost stacked bar, state breakdown, power trend line
- Add state timeline color bar (24-hr)
- Add `RateConfigPanel`: $/kWh input, voltage, power factor

### Phase 4 — Polish
- Loading states and error handling on all components
- Auto-refresh: 30-second interval for live current card, 5-minute for all others
- CSV export button on 7-day daily summary table
- README.md with setup, environment variables, and run instructions

---

## 8. Configuration Reference

### `backend/config.py`

```python
# TimeBase Connection
TIMEBASE_BASE_URL = "http://your-timebase-server/api"
TIMEBASE_API_KEY  = "your-key-here"

# UNS Tag Paths
TAGS = {
    "motor_amps":    "Driftwood Dairy/El Monte CA/Raw Side/Separator/1/Edge/Motor Amps",
    "running":       "Driftwood Dairy/El Monte CA/Raw Side/Separator/1/Edge/Running",
    "cip":           "Driftwood Dairy/El Monte CA/Raw Side/Separator/1/Edge/CIP",
    "process":       "Driftwood Dairy/El Monte CA/Raw Side/Separator/1/Edge/Process Values/Process",
    "standby":       "Driftwood Dairy/El Monte CA/Raw Side/Separator/1/Edge/Process Values/Stand By",
    "feed_flowrate": "Driftwood Dairy/El Monte CA/Raw Side/Separator/1/Edge/Process Values/Feed Flowrate",
}

# Electrical
VOLTAGE      = 460
POWER_FACTOR = 0.88

# SCE Rate (overridable via POST /api/config)
DEFAULT_RATE_PER_KWH = 0.30
```

### Python Dependencies (`requirements.txt`)

```
fastapi==0.110.0
uvicorn==0.27.0
httpx==0.27.0
pandas==2.2.0
pydantic==2.6.0
python-dotenv==1.0.0
```

### Frontend Dependencies

```
react, react-dom
recharts
axios
tailwindcss
dayjs
vite
```

---

## 9. Immediate Next Steps

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1 | Confirm TimeBase REST endpoint URL and auth method | Randy | Pending |
| 2 | Confirm exact UNS tag path strings for all 6 tags | Randy | Pending |
| 3 | Obtain actual SCE utility bill for real $/kWh rate | Driftwood Dairy | Pending |
| 4 | Confirm separator motor voltage (460V assumed) | Driftwood Dairy | Pending |
| 5 | Decision: dedicated historian dataset or query existing | Randy | Pending |
| 6 | Set up local dev environment (Python 3.11+, Node 18+) | Randy | Pending |

---

*Texas Automation Systems · Randy Lesovsky · February 2026*
