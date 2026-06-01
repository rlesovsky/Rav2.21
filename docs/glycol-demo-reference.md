# Glycol Chiller demo — data model reference (provided by user)

Source: artifact 2ba370a1-fe5e-4f6c-9f72-4f95a74a9fdf (React/Recharts).
User wants THIS DATA rendered in the current DriftView style (not this demo's style).
NOT a SCADA system — keep threshold status coloring, but NO alarm list/feature.

## UNS path
emqx.tse.prod / Driftwood Dairy / El Monte CA / Raw Side / Glycol

## Seed values (from UNS tree)
- tankTemp (glycol supply/tank temp): 28.2662 °F
- tankLevel: 87.0571 %
- c1in (Chiller 1 inlet): 40.6256 °F
- c1out (Chiller 1 outlet): 38.9831 °F
- c2in (Chiller 2 inlet): 42.411 °F
- c2out (Chiller 2 outlet): 41.576 °F
- plcTemp (panel/PLC temp): 71.7246 °F
- pressure (system pressure): 34.4102 PSI

## Thresholds
- supply setpoint 28 °F, band ±2, alarm ±4
- level: low 40%, lo-lo 20%
- pressure: lo 25 / hi 45, lolo 20 / hihi 55 PSI
- PLC: warn 85°, trip 100°
- low ΔT warn: < 1.0 °F

## Derived
- GLYCOL_FACTOR = 0.94 (≈30% propylene glycol SG×Cp correction vs water)
- per-chiller ΔT = inlet − outlet
- per-chiller tons = GPM × 500 × ΔT × 0.94 ÷ 12000  (default GPM 120, user-editable slider 20–300)
- totalTons = c1tons + c2tons ; totalDt = c1dt + c2dt
- c1 load share % = c1dt / totalDt × 100

## Panels (render in DriftView style)
1. KPI row: Glycol Supply Temp, Tank Level (with vertical gauge), System Pressure, Panel/PLC Temp — each with status dot colored by threshold
2. Two Chiller cards: inlet → outlet, ΔT (big), RUNNING/LOW-ΔT chip, ΔT bar (dt/8*100%), ≈tons removed
3. Estimated Cooling Load: big tons number + formula + flow/chiller slider
4. Chiller Load Balance: CH1% / CH2% split bar
5. Temperature & Pressure Trend: supply, c1out, c2out (left °F axis 24–46), pressure (right PSI axis 15–55), setpoint reference line at 28°F

## Data source note
This is DEMO data (glycol has no live backend feed yet). Mark as DEMO/preview, do not present as live.
A flow meter topic would replace the GPM estimate.
