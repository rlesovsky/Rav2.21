# 01 — Project Context Prompt
## Load this at the start of EVERY session

---

## PROMPT (copy everything below this line)

---

You are assisting with the development of a **Separator Energy Cost Dashboard** for
Driftwood Dairy's El Monte, CA facility. This is a Python + React web application
that reads separator operational data from a TimeBase historian via REST API and
calculates real-time energy costs broken down by operating state.

## Project Stack
- **Backend:** Python 3.11 + FastAPI
- **Frontend:** React (Vite) + Recharts + Tailwind CSS
- **Data Source:** TimeBase Historian — REST API (HTTP/JSON)
- **Historian Tags:** Fetched as JSON arrays of {timestamp, value} objects

## Facility Context
- **Client:** Driftwood Dairy — El Monte, CA
- **Separator:** Unit 1, Raw Side (Alfa Laval centrifuge separator)
- **Energy Provider:** Southern California Edison (SCE)
- **Rate Class:** TOU-GS-2 (Commercial, 20–200 kW demand)
- **Default Rate:** $0.30/kWh blended (configurable in app)

## UNS Tag Paths (TimeBase)
```
Base: Driftwood Dairy/El Monte CA/Raw Side/Separator/1/Edge/

motor_amps:    .../Motor Amps              (Float, 1-min samples)
running:       .../Running                 (Boolean, on-change)
cip:           .../CIP                     (Boolean, on-change)
process:       .../Process Values/Process  (Boolean, on-change)
standby:       .../Process Values/Stand By (Boolean, on-change)
feed_flowrate: .../Process Values/Feed Flowrate (Float, 1-min samples)
```

## Power Calculation
```
kW = (Motor_Amps × 460 × 1.732 × 0.88) / 1000
  Voltage      = 460V (3-phase)
  Power Factor = 0.88
  At 47A → 33.0 kW
```

## State Detection Logic (Priority Order)
```python
if cip:                                          → 'CIP'
elif running and process and feed_flowrate > 0:  → 'Processing'
elif running and standby:                        → 'Idle'
elif not running:                                → 'Shutdown'
else:                                            → 'Unknown'
```

## Expected Power by State
| State      | Amps    | kW           | $/hr @ $0.30  |
|------------|---------|--------------|---------------|
| Processing | 43–47A  | 30.2–33.0 kW | $9.06–$9.90   |
| CIP        | 35–40A  | 24.6–28.1 kW | $7.38–$8.43   |
| Idle       | 20–25A  | 14.1–17.6 kW | $4.23–$5.28   |
| Shutdown   | 3–5A    | 2.1–3.5 kW   | $0.63–$1.05   |

## FastAPI Endpoints
| Endpoint               | Description                        |
|------------------------|------------------------------------|
| GET /api/energy/summary  | 7-day total cost + kWh by state  |
| GET /api/energy/daily    | Daily cost breakdown (7 rows)    |
| GET /api/energy/timeline | Hourly kW + state (last 24 hrs)  |
| GET /api/energy/current  | Live amps, kW, $/hr              |
| GET/POST /api/config     | Rate and electrical settings     |

## Project File Structure
```
separator-energy-dashboard/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── routers/energy.py
│   ├── services/
│   │   ├── timebase_client.py
│   │   ├── state_engine.py
│   │   └── cost_calculator.py
│   └── models/schemas.py
└── frontend/
    └── src/
        ├── App.jsx
        ├── components/
        │   ├── CostSummaryCards.jsx
        │   ├── StateCostBreakdown.jsx
        │   ├── EnergyTrendChart.jsx
        │   ├── CostByDayChart.jsx
        │   ├── StateTimeline.jsx
        │   └── RateConfigPanel.jsx
        └── api/energyApi.js
```

Always write clean, production-quality code with comments. Ask for clarification
if you need the TimeBase API response format before writing client code.
