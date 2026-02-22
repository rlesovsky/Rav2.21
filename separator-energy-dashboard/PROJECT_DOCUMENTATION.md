# Separator Energy Cost Dashboard
## Driftwood Dairy — El Monte, CA

**Built by:** Texas Automation Systems
**Date:** February 2025
**Status:** POC (Proof of Concept)

---

## 1. What This Application Does

This dashboard monitors the energy consumption and cost of a dairy separator in real time. It reads operational data from a TimeBase historian, classifies the machine's operating state, calculates power draw, and applies SCE TOU-GS-2 tiered electricity pricing to show exactly how much the separator costs to run — broken down by state, shift, and day.

---

## 2. Architecture

```
┌──────────────┐     REST API      ┌──────────────┐     HTTP/JSON     ┌──────────────┐
│   TimeBase   │ ◄──────────────── │   FastAPI     │ ◄──────────────── │   React      │
│   Historian  │   192.254.155.2   │   Backend     │   localhost:8000  │   Frontend   │
│   (Plant)    │      :4511        │   (Python)    │                   │   (Vite)     │
└──────────────┘                   └──────────────┘                   └──────────────┘
```

**Backend:** Python 3.11 + FastAPI + httpx (async) + pandas + Pydantic v2
**Frontend:** React 19 (Vite) + Recharts + Tailwind CSS v4.2 + Axios + dayjs

---

## 3. Data Source

| Parameter      | Value                                    |
|----------------|------------------------------------------|
| Historian      | TimeBase by Flow Software                |
| Host           | `192.254.155.2:4511`                     |
| Dataset        | `Driftwood Historian`                    |
| API Endpoint   | `/api/datasets/{dataset}/data`           |
| Response Shape | `{ "tl": [{ "t": {...}, "d": [{t, v, q}, ...] }] }` |
| Timezone       | US/Pacific                               |

### Tags Used

| Key         | Full Tag Path                                                              | Type           | Sample Rate  |
|-------------|----------------------------------------------------------------------------|----------------|--------------|
| Motor Amps  | `Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/Motor Amps`         | System.Double  | ~10 seconds  |
| Process     | `Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/Process Values/Process` | System.Boolean | On-change    |
| CIP         | `Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/Process Values/CIP`    | System.Boolean | On-change    |
| Running     | `Driftwood Dairy/El Monte CA/Raw Side/Seperator/1/Edge/Process Values/Running` | System.Boolean | On-change    |

> **Note:** The tag path uses the spelling `Seperator` (not `Separator`) — this matches the UNS naming in the historian. The boolean state tags come from the `Process Values` subfolder, not the Edge root.

### Data Quality

- Only samples with quality >= 192 are used (good quality per OPC standard)
- Boolean values arrive as integers (1/0), converted to Python `bool`
- Missing values handled with `pd.isna()` check (not `x is None`, since pandas uses `NaN`)

---

## 4. Operating States

The separator has four classified operating states, determined by three boolean tags from the Process Values folder:

| Process Tag | CIP Tag | Running Tag | State          | Color  | Meaning                              |
|-------------|---------|-------------|----------------|--------|--------------------------------------|
| True        | False   | True        | **Processing** | Green  | Actively separating milk             |
| False       | True    | True        | **CIP**        | Blue   | Clean-In-Place cycle                 |
| False       | False   | True        | **Idle**       | Amber  | Motor running, not processing or CIP |
| False       | False   | False       | **Shutdown**   | Gray   | Machine completely off               |

Running is always true when Processing or CIP is active. If Process=false, CIP=false, but Running=true, the separator is Idle — the motor is spinning but no work is being done.

---

## 5. Power & Cost Formulas

### Power Calculation (3-Phase Motor)

```
kW = (Amps x Voltage x sqrt(3) x Power Factor) / 1000
kW = (Amps x 460 x 1.732 x 0.88) / 1000
```

| Parameter    | Default Value | Configurable |
|--------------|---------------|--------------|
| Voltage      | 460 V         | Yes          |
| Power Factor | 0.88          | Yes          |
| sqrt(3)      | 1.732         | No (constant)|

### Energy Calculation

```
kWh per interval = kW x (1 minute / 60)
```

Data is resampled to 1-minute intervals. Boolean tags are forward-filled. Analog tags (amps) are interpolated for gaps up to 5 minutes.

### Cost Calculation

```
Cost per interval = kWh x TOU Rate ($/kWh)
```

The TOU rate is looked up per-row based on the timestamp, so each minute gets the correct rate for that time of day and season.

---

## 6. SCE TOU-GS-2 Rate Schedule

> **Note:** These are placeholder rates for the POC. Replace with actual bill rates for production.

### Summer (June 1 – September 30)

| Period        | Hours (Weekdays)    | Rate      |
|---------------|---------------------|-----------|
| On-Peak       | 4:00 PM – 9:00 PM  | $0.38/kWh |
| Mid-Peak      | 8:00 AM – 4:00 PM  | $0.28/kWh |
| Off-Peak      | All other hours     | $0.18/kWh |

### Winter (October 1 – May 31)

| Period         | Hours                | Rate      |
|----------------|----------------------|-----------|
| Mid-Peak       | 4:00 PM – 9:00 PM (weekdays) | $0.30/kWh |
| Super Off-Peak | 8:00 AM – 4:00 PM   | $0.16/kWh |
| Off-Peak       | All other hours      | $0.22/kWh |

Fallback flat rate (if TOU logic fails): $0.30/kWh

---

## 7. Shift Definitions

All times are in US/Pacific:

| Shift     | Start     | End       |
|-----------|-----------|-----------|
| 1st Shift | 6:00 AM   | 2:00 PM   |
| 2nd Shift | 2:00 PM   | 10:00 PM  |
| 3rd Shift | 10:00 PM  | 6:00 AM   |

---

## 8. API Endpoints

| Method | Path                  | Description                                      |
|--------|-----------------------|--------------------------------------------------|
| GET    | `/api/energy/summary` | 7-day totals by state and shift                  |
| GET    | `/api/energy/daily`   | Per-day cost breakdown (last 7 days)             |
| GET    | `/api/energy/timeline`| Per-minute kW, state, cost (last 24 hours)       |
| GET    | `/api/energy/current` | Live snapshot: amps, kW, $/hr, state, TOU, shift|
| GET    | `/api/config`         | Current electrical & rate settings               |
| POST   | `/api/config`         | Update rate, voltage, power factor               |
| GET    | `/api/raw`            | Debug: raw tag data with configurable lookback   |

---

## 9. Frontend Dashboard Components

| Component            | Data Source        | What It Shows                                         |
|----------------------|--------------------|-------------------------------------------------------|
| Rate & Electrical Config | `/api/config`  | Editable voltage, power factor, fallback rate         |
| Live Status          | `/api/energy/current` | Current state, amps, kW, $/hr, TOU period, shift  |
| KPI Summary Cards    | `/api/energy/summary` | 7-day cost, total kWh, avg $/hr, processing %     |
| Cost by State        | `/api/energy/summary` | Pie chart + table: cost split by Processing/CIP/Shutdown |
| Cost by Shift        | `/api/energy/summary` | Bar chart + table: cost split by 1st/2nd/3rd shift|
| Daily Cost (7-Day)   | `/api/energy/daily`   | Stacked bar chart: daily cost by state             |
| Power Draw (24-Hour) | `/api/energy/timeline`| Area chart: kW over time with state/TOU in tooltip |
| State Timeline       | `/api/energy/timeline`| Color-coded horizontal bar of state transitions    |

### Refresh Pattern

- **No auto-polling** — the app is designed to be lightweight
- Single global refresh button in the header
- All 8 components share a `refreshKey` counter; incrementing it triggers all fetches in parallel
- Spinner stops when all 8 components report back via `onRefreshComplete` callback

### Info Tooltips

Every component has a small (i) icon next to its title. Clicking it opens a floating panel explaining the data source, tags used, and formulas for that specific card. Tooltips render via React portal so they overlay above all containers.

---

## 10. Key Decisions & Bugs Fixed During Build

### Decisions

1. **3 tags instead of 6** — Feed Flowrate had stale data (only 1 sample since Feb 7). Process and Stand By tags were unreliable. Simplified to Motor Amps + Running + CIP only.

2. **3 states instead of 5** — Without Feed Flowrate we can't distinguish Processing from Standby. Collapsed to Processing / CIP / Shutdown.

3. **Manual refresh only** — No setInterval polling to keep resource usage minimal. Operator clicks refresh when they want current data.

4. **Placeholder TOU rates** — Actual SCE bill was not available. Rates are approximate for POC; update from real bill for production.

### Bugs Found & Fixed

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| 404 on TimeBase API | Endpoint was `/api/dataset/` (singular) | Changed to `/api/datasets/` (plural) |
| 404 on tag lookup | Tag path used `Separator` | Changed to `Seperator` (matches historian) |
| Dataset not found | Config had `__Driftwood Historian` | Changed to `Driftwood Historian` |
| NaN crash in state engine | `x is None` doesn't catch pandas NaN | Changed to `pd.isna(x)` |
| Port 8000 in use | Previous server still running | Kill with `lsof -ti:8000 \| xargs kill -9` |

---

## 11. How to Run

### Backend
```bash
cd separator-energy-dashboard/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd separator-energy-dashboard/frontend
npm install
npm run dev
```

Open `http://localhost:5173` in a browser.

> **Requires VPN connection** to reach the TimeBase historian at `192.254.155.2:4511`.

---

## 12. File Structure

```
separator-energy-dashboard/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── config.py                # Tags, rates, shifts, electrical params
│   ├── models/
│   │   └── schemas.py           # Pydantic response models
│   ├── routers/
│   │   └── energy.py            # API endpoint definitions
│   └── services/
│       ├── timebase_client.py   # TimeBase REST API client
│       ├── state_engine.py      # State classification + DataFrame builder
│       └── cost_calculator.py   # Power, energy, cost calculations
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main layout + refresh orchestration
│   │   ├── api/
│   │   │   └── energyApi.js     # Axios API wrapper
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── InfoTooltip.jsx
│   │   │   ├── LiveStatusCard.jsx
│   │   │   ├── KPISummaryCards.jsx
│   │   │   ├── StateCostBreakdown.jsx
│   │   │   ├── ShiftCostBreakdown.jsx
│   │   │   ├── CostByDayChart.jsx
│   │   │   ├── EnergyTrendChart.jsx
│   │   │   ├── StateTimeline.jsx
│   │   │   └── RateConfigPanel.jsx
│   │   └── utils/
│   │       └── formatters.js    # Currency, kWh, % formatters
│   └── index.html
└── PROJECT_DOCUMENTATION.md     # This file
```
