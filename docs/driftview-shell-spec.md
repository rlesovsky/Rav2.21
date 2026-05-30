# DriftView Platform Shell — Integration Specification

**Repository:** rlesovsky/Rav2.21
**Subject:** Converting the standalone Separator Energy Cost Dashboard into the **DriftView** platform framework
**Author of spec:** Texas Automation Systems
**Status:** Design / implementation guide
**Scope note:** This document describes a **frontend framework refactor**. It deliberately excludes the chiller, the HTST/pasteurizer, and any alarm functionality.

> This file is the saved, authoritative copy of the DriftView spec. The body below (§1–§12) is the original specification verbatim. The **Implementation Addendum** at the end records decisions and clarifications agreed during planning.

---

## 1. Purpose

Rav2.21 today is a single-screen, single-asset dashboard. The goal of this change is to wrap that existing dashboard inside the **DriftView platform shell** — a persistent navigation frame with a left rail, a global context bar, a fleet-overview landing page, and per-asset tabs — so that the Separator becomes the *first asset inside a platform* rather than a standalone application.

The existing data layer, the FastAPI backend, the historian integration, and the Recharts components stay intact. What changes is the **outer structure** that those components live in, and the **visual theme** applied over them.

### What this adds
- A DriftView-branded **application shell**: left navigation rail + top context bar + scrollable content region.
- A **Fleet Overview** landing page that summarizes the site and links into the asset.
- A **Separator asset page** organized into tabs (**Live**, **Analysis**, **Trends**).
- A **DriftView dark theme** (navy/blue/teal identity, DV logo mark, serif + sans + mono type system) applied across the app.
- A small, data-driven **asset registry** so the rail and routing are configuration-driven and can scale later without structural rework.

### Explicit non-goals (do not build these)
- **No chiller** asset, metrics, components, routes, or copy.
- **No HTST / pasteurizer** asset, metrics, components, routes, or copy.
- **No alarms** — no alarms tab, no alarms page, no alarm table, no alarm badges, no alarm endpoints, no alarm severity styling.

---

## 2. Current state (baseline)

- **Frontend:** React 19 + Vite, Tailwind CSS v4, Recharts, Axios, dayjs, lucide-react. Single-page layout assembled in `App.jsx` with a global `refreshKey` pattern (one refresh button in the header fans out to all data components; each calls `onRefreshComplete()` when done).
- **Existing components:** `Header`, `LiveStatusCard`, `KPISummaryCards`, `StateCostBreakdown`, `ShiftCostBreakdown`, `CostByDayChart`, `EnergyTrendChart`, `StateTimeline`, `RateConfigPanel`, `InfoTooltip`.
- **Data access:** `src/api/energyApi.js` (Axios, base `/api`) with `fetchCurrent`, `fetchSummary`, `fetchDaily`, `fetchTimeline`, `fetchConfig`, `updateConfig`. Helpers in `src/utils/formatters.js`.
- **Backend:** FastAPI exposing `/api/energy/current|summary|daily|timeline` and `/api/config`. States are Processing / CIP / Idle / Shutdown; pricing is SCE TOU-GS-2; shifts are 1st/2nd/3rd.

All of the above is **reused as-is**. The refactor is additive and reorganizing — it does not rewrite the data components or the backend.

> **Data-source note (see Addendum A):** the live data path is the **Timebase historian accessed via its i3X API** (the `i3x_client`, `USE_I3X=true` by default), with a legacy plain-REST TimeBase client retained only as rollback. The frontend never talks to the historian directly — it only calls the app's own `/api/*` endpoints. DriftView does not change any of this.

---

## 3. Target architecture — the shell

### 3.1 Layout anatomy
- **Left rail (sidebar):** persistent, full-height. Top to bottom — DriftView brand lockup (DV mark + wordmark + small tagline), a "Monitoring" section, an "Operations" section, and a site picker pinned to the bottom. The rail collapses to icon-only on narrow viewports.
- **Main column:** a sticky **context bar** at the top, an optional **tab strip** directly beneath it (present only on asset pages), and a **scrollable content region** below.

### 3.2 Navigation model
**Monitoring**
- Fleet Overview
- Separator (with a small live-status dot)

**Operations**
- Reports
- Settings

There is no Alarms entry. There are no other assets in the rail.

### 3.3 Asset registry (single asset, built to scale)
One small configuration source of truth — an **asset registry** — listing the assets DriftView knows about. For this scope it contains a single entry: the Separator (id, display name, location/rate label, icon, route path, status accent color). The rail, the Fleet Overview tiles, and the asset routes are all generated from this registry. The registry must not contain a chiller or pasteurizer entry.

### 3.4 Per-asset tabs
- **Live** — real-time snapshot and the rolling state view.
- **Analysis** — the cost/energy analytics. Default tab on open.
- **Trends** — time-series detail.

There is no Alarms tab.

---

## 4. Page-by-page specification

### 4.1 App shell / layout
A new top-level layout component owns the rail + context bar + content frame and renders the active page into the content region. The global refresh behavior is **lifted into the shell**: the refresh control lives in the context bar, and the `refreshKey` / completion mechanism is preserved but scoped to whichever asset page is currently mounted (only mounted data components participate in a refresh). The live clock and the "System online" indicator move from the old `Header` into the context bar.

### 4.2 Sidebar (navigation rail)
- Brand lockup at top: the DV mark, the two-tone *Drift* / *View* wordmark, and the "Process Insight" tagline.
- Monitoring and Operations sections (3.2), asset entries generated from the registry.
- Active item visually marked (accent left-bar + highlighted background).
- Site picker pinned to bottom showing "Driftwood Dairy — El Monte, CA."
- The Separator entry shows a small status dot driven by the current operating-state color.

### 4.3 Context bar
- **Breadcrumb:** "Driftwood Dairy › {active page title}."
- **Search field** (visual/structural placeholder acceptable for v1).
- **Refresh button** (global refresh trigger).
- **Live clock** (Plant time, Pacific).
- **System-online pill.**

### 4.4 Fleet Overview (landing page)
The default route.
- **Site roll-up KPI cards** at the top, labeled at the site level.
- **Asset tiles:** responsive grid generated from the registry — one tile (Separator) showing live status, headline metrics (7-day cost, processing %, live kW), and an "Open dashboard" affordance.
- **Site cost chart:** a stacked daily-cost chart (reuse existing daily-cost data).

No alarm summary, counts, or tiles.

### 4.5 Separator asset page
Renders the tab strip (Live / Analysis / Trends), **Analysis** active by default.
- **Live tab:** `LiveStatusCard` + `StateTimeline`.
- **Analysis tab:** `KPISummaryCards` + `StateCostBreakdown` + `ShiftCostBreakdown` + `CostByDayChart`.
- **Trends tab:** `EnergyTrendChart`.

### 4.6 Settings
The existing **Rate & electrical config** (`RateConfigPanel`, backed by `/api/config`) moves into a Settings page reached from Operations. Read/update behavior preserved.

### 4.7 Reports
A forward-looking placeholder page in Operations ("coming soon"). No report generation required.

---

## 5. Mapping existing components into the shell

| Existing component | New home | Notes |
| --- | --- | --- |
| `Header` | **Context bar** (shell) | Decomposed: clock + status + refresh move into the context bar; old Header retired. |
| `LiveStatusCard` | Separator → **Live** tab | `/api/energy/current`. |
| `StateTimeline` | Separator → **Live** tab | `/api/energy/timeline`. |
| `KPISummaryCards` | Separator → **Analysis** tab | `/api/energy/summary`. |
| `StateCostBreakdown` | Separator → **Analysis** tab | donut + table by state. |
| `ShiftCostBreakdown` | Separator → **Analysis** tab | stacked bar by shift. |
| `CostByDayChart` | Separator → **Analysis** tab; also Fleet site-cost chart | reused on Fleet Overview. |
| `EnergyTrendChart` | Separator → **Trends** tab | `/api/energy/timeline`. |
| `RateConfigPanel` | **Settings** page | behavior preserved. |
| `InfoTooltip` | Everywhere used today | Unchanged. |

---

## 6. DriftView dark theme system

Centralize as a theme token layer (CSS variables).

### 6.1 Color tokens
| Token | Value | Use |
| --- | --- | --- |
| Background base | `#060c19` → `#070e1d` | App background gradient |
| Panel / Panel-2 | `#0e2140` / `#0b1a33` | Cards and panels |
| Hairline | `#1c3253` / `#152846` | Borders, dividers |
| Ink / dim / faint | `#e8f0fb` / `#9fb4d2` / `#67809f` | Text hierarchy |
| DriftView Navy | `#1c4e8a` | Brand, the D in the mark |
| DriftView Blue | `#2f86d8` | Primary actions, active states |
| Driftwood Teal | `#2bb6b3` | Accent, focus, the checkmark |
| State — Processing | `#27c281` | Operating-state semantic (green) |
| State — CIP | `#2f86d8` | Operating-state semantic |
| State — Idle | `#f2a43a` | Operating-state semantic |
| State — Shutdown | `#5b7193` | Operating-state semantic |

Keep operating-state colors semantic; let blue/teal carry brand identity in chrome, KPI accents, and active states.

### 6.2 Typography
- **Display / brand:** a serif (e.g. DM Serif Display) for the wordmark and panel titles.
- **UI:** IBM Plex Sans for body and labels.
- **Data:** IBM Plex Mono (tabular figures) for numeric readouts.

### 6.3 Logo / identity
- **DV mark** as inline SVG (navy D + teal checkmark V); used in the rail and as the app icon.
- Two-tone *Drift* (navy/light) / *View* (blue) wordmark.
- Tagline: "Live Dairy Process Insight" / "Process Insight" in spaced uppercase.

### 6.4 Component restyle
Restyle Recharts components to the dark theme (panel backgrounds, hairline borders, grid/axis/label colors, series colors from tokens). Data and structure unchanged.

---

## 7. Routing & state

- Adopt client-side routing (React Router). Routes: Fleet Overview (index), Separator asset, Settings, Reports.
- Asset tabs (Live / Analysis / Trends) are **nested routes** under the Separator path (linkable/shareable active tab).
- Routes and rail entries generated from the **asset registry** (§3.3).
- Preserve the global refresh contract: the context-bar refresh increments a shared `refreshKey`; only data components mounted in the active tab/page subscribe and report completion.

---

## 8. Proposed file / folder additions

Within `separator-energy-dashboard/frontend/src/`:
- A **layout** area: app-layout, sidebar/nav-rail, context-bar.
- A **pages** area: Fleet Overview, Separator asset page, Settings, Reports.
- A **config** area: the asset registry (single Separator entry).
- A **theme** area: DriftView token definitions + DV logo SVG.

Existing folders (`api/`, `components/`, `utils/`) remain. `App.jsx` is reduced to mounting the router and the layout.

---

## 9. Backend considerations

For this scope, the backend requires **no functional change**. Existing separator energy and config endpoints serve every view.
- Do **not** add alarm endpoints/models/fields.
- Do **not** add chiller or pasteurizer endpoints or tags.
- Optional future-only note: the API could later be expressed as asset-scoped. Not a task for this change.

---

## 10. Migration plan (phased, low-risk)

1. **Introduce the shell around the current page.** Add layout, sidebar, context bar; render the existing dashboard in the content region. Move clock/refresh/status into the context bar and retire `Header`.
2. **Add routing and the asset registry.** Stand up Fleet Overview, Separator, Settings, Reports routes from the single-entry registry. Wire rail + Fleet tile navigation.
3. **Split the Separator page into tabs.** Distribute components into Live / Analysis / Trends. Confirm the refresh contract holds.
4. **Move Rate & electrical config to Settings.**
5. **Apply the DriftView dark theme.** Token layer + restyle shell and charts. Add DV mark and wordmark.
6. **Polish.** Responsive rail collapse, transitions, Reports placeholder.

Each phase is independently shippable.

---

## 11. Acceptance criteria

- App opens on a **Fleet Overview** page (site KPIs, single Separator tile, site cost chart).
- A persistent **left rail** lists Fleet Overview + Separator (Monitoring) and Reports + Settings (Operations) — and nothing else.
- The **Separator** page presents **Live / Analysis / Trends** tabs, Analysis default; all charts render in their tabs.
- **Rate & electrical config** reachable from **Settings**, still reads/writes `/api/config`.
- The **DriftView dark theme** (tokens, DV mark, two-tone wordmark, type system) is applied throughout.
- Global **refresh**, **live clock**, and **system-online** indicator function from the context bar.
- **No Alarms** UI, route, tab, badge, or endpoint anywhere.
- **No chiller** and **no HTST/pasteurizer** UI, data, route, or copy anywhere.

---

## 12. Out of scope / explicitly excluded

- Alarms in every form.
- Chiller / glycol monitoring.
- HTST / pasteurizer monitoring.
- Multi-site support (single site, Driftwood Dairy — El Monte).
- New data sources, tags, or aggregations beyond the current API.
- Backend feature work (only the optional future note in §9).

---

# Implementation Addendum (planning decisions)

These notes were agreed during planning and supersede ambiguities in the body above.

### A. Data source — i3X vs. TimeBase (confirm before editing any data-layer docs)

The live data path is the **Timebase historian accessed via its i3X API**, not the legacy TimeBase REST API:
- `services/i3x_client.py` (`POST /i3x/objects/{value,history,list}`) is selected by `services/historian_client.py` when `USE_I3X=true` (the default in `config.py`).
- `services/timebase_client_legacy.py` (`GET /api/datasets/{dataset}/data`) is retained as rollback only.
- Both hit the **same** historian (`192.254.155.2:4511`, dataset "Driftwood Historian", same four tags). i3X is a different *API surface on the same historian*, not a different system.

**Doc skew:** the committed root `README.md` still describes the pre-migration TimeBase-REST architecture; the i3X migration is in-progress and **uncommitted** on branch `feat/i3x-consumer-client` (the new client modules are untracked; `config.py`/`main.py` are modified). The footer's "data via i3X" reflects the new reality.

**Rule:** DriftView is frontend-only and must **not** edit data-layer wording in the README/backend. Reconciling README ⇄ i3X belongs to the i3X branch work, not this refactor. If/when the data-source description is updated, the accurate phrasing is *"the Timebase historian via its i3X API"* — do not simply flip "TimeBase" → "i3X".

### B. Tab data: nested routes + data hoisting

Tabs are nested routes (for deep-linking/back-forward). Because the app is manual-refresh-only, naive nested routes would refetch on every tab switch. To avoid that and keep the refresh contract closest to today's single fan-out: **hoist the shared fetches (`summary`, `daily`, `timeline`, `current`) up to `SeparatorPage`** and pass data into the tab components. Consequence: the data components shift from self-fetching to receiving data (via a `SeparatorPage`-level data hook/context). This is an accepted, intentional deviation from "components untouched"; it also dedupes redundant calls within the Analysis tab (3 `/summary` calls → 1). Lands in Phase 3.

### C. Refresh contract: dynamic subscriber count

Replace the hardcoded `REFRESH_COMPONENT_COUNT = 8` with a `RefreshContext` whose subscribers register on mount and unregister on unmount. A refresh expects exactly the number of subscribers mounted at trigger time, so tabbed (partially-mounted) pages report completion correctly.

### D. Branding: keep DriftView and Driftwood separate

DriftView (DV mark + *Drift*/*View* wordmark) is the **product** identity — top of the rail. Driftwood Dairy is the **client/site** — its identity lives only in the site picker at the bottom of the rail ("Driftwood Dairy — El Monte, CA", optional small Driftwood logo). Do **not** stack both logos in the brand lockup. The favicon stays as-is.

### E. Pre-flight checklist for the implementing agent

- `Header.jsx` is imported only by `App.jsx` (verified) — safe to retire in Phase 1.
- Refresh completion must count mounted subscribers dynamically (see C).
- No commits until the user asks; keep DriftView changes separable from the uncommitted i3X WIP.
