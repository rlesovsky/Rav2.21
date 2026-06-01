// GlycolPage — PREVIEW ONLY. There is no live glycol-chiller feed yet, so this
// page runs a self-contained simulation seeded from the real UNS values
// (emqx.tse.prod / Driftwood / El Monte / Raw Side / Glycol). The DATA MODEL is
// ported from the user's glycol demo (supply/level/pressure/PLC, two chillers
// with ΔT + tons, derived cooling load with an editable flow, load balance, and
// a temperature/pressure trend); the STYLE is DriftView (panels/cards/tokens).
//
// This is NOT a SCADA system: there is no alarm list/feed. Threshold-based
// status DOT coloring on cards is kept purely as data-viz. A DEMO banner makes
// the preview nature explicit.
import { useEffect, useRef, useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts"

// Seed values pulled from the UNS tree.
const SEED = {
  tankTemp: 28.2662, tankLevel: 87.0571,
  c1in: 40.6256, c1out: 38.9831, c2in: 42.411, c2out: 41.576,
  plcTemp: 71.7246, pressure: 34.4102,
}

// Thresholds (edit to match real setpoints).
const T = {
  supplySP: 28, supplyBand: 2, supplyAlarm: 4,
  levelLow: 40, levelLowLow: 20,
  pressLo: 25, pressHi: 45, pressLoLo: 20, pressHiHi: 55,
  plcWarn: 85, plcAlarm: 100,
  lowDeltaT: 1.0,
}
const GLYCOL_FACTOR = 0.94 // ~30% propylene glycol: SG×Cp correction vs water

const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? "--" : v.toFixed(d))
const noise = (base, amp) => base + (Math.random() - 0.5) * amp

// Status → DriftView token color (data-viz only, not alarms).
const STATUS = {
  ok: "var(--good)",
  warn: "var(--warn)",
  alarm: "var(--bad)",
}
const supplyStatus = (t) => {
  const d = Math.abs(t - T.supplySP)
  return d > T.supplyAlarm ? "alarm" : d > T.supplyBand ? "warn" : "ok"
}
const levelStatus = (l) => (l < T.levelLowLow ? "alarm" : l < T.levelLow ? "warn" : "ok")
const pressStatus = (p) => (p < T.pressLoLo || p > T.pressHiHi ? "alarm" : p < T.pressLo || p > T.pressHi ? "warn" : "ok")
const plcStatus = (t) => (t > T.plcAlarm ? "alarm" : t > T.plcWarn ? "warn" : "ok")

function DemoBanner() {
  return (
    <div className="panel mb" style={{ borderColor: "var(--warn)", background: "rgba(242,164,58,.08)" }}>
      <h3 style={{ color: "#f6c179" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "0 0 auto" }}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        Demo / preview data
      </h3>
      <div className="sub" style={{ marginBottom: 0 }}>
        The Glycol Chiller is not yet connected to a live source. Values below are simulated
        from seed readings to preview the layout — do not treat them as live. Wire the UNS
        glycol topics to make this real.
      </div>
    </div>
  )
}

// KPI card with a threshold status dot (mockup .card shell).
function KpiCard({ label, value, unit, accent, status, sub }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}` }}>
      <span
        style={{
          position: "absolute", top: 14, right: 14, width: 8, height: 8, borderRadius: 8,
          background: STATUS[status], boxShadow: `0 0 6px ${STATUS[status]}`,
        }}
      />
      <div className="kl">{label}</div>
      <div className="kv" style={{ color: accent }}>
        {value}{unit && <small>{unit}</small>}
      </div>
      <div className="delta"><span className="x">{sub}</span></div>
    </div>
  )
}

// Tank level KPI with a vertical gauge.
function TankCard({ level, status }) {
  return (
    <div className="card" style={{ display: "flex", gap: 14, borderTop: "3px solid var(--c-cold)" }}>
      <div style={{ flex: 1 }}>
        <div className="kl">Glycol Tank Level</div>
        <div className="kv" style={{ color: "var(--c-cold)" }}>{fmt(level)}<small>%</small></div>
        <div className="delta"><span className="x">Low {T.levelLow}% · LoLo {T.levelLowLow}%</span></div>
      </div>
      <div style={{ width: 26, borderRadius: 6, border: "1px solid var(--line)", background: "var(--panel-2)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${level}%`, background: "linear-gradient(180deg, var(--cyan), var(--teal))", transition: "height .6s" }} />
        <div style={{ position: "absolute", bottom: `${T.levelLow}%`, left: 0, right: 0, height: 1, background: "var(--warn)", opacity: 0.7 }} />
        <div style={{ position: "absolute", top: 6, right: 4, width: 6, height: 6, borderRadius: 6, background: STATUS[status] }} />
      </div>
    </div>
  )
}

function ChillerStat({ lbl, v, u, col }) {
  return (
    <div>
      <div className="kl" style={{ fontSize: 9 }}>{lbl}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: col, lineHeight: 1.1 }}>
        {v}<small style={{ fontSize: 12, color: "var(--ink-dim)" }}>{u}</small>
      </div>
    </div>
  )
}

function ChillerCard({ n, inT, outT, dt, tons }) {
  const low = dt < T.lowDeltaT
  const dtColor = low ? "var(--warn)" : "var(--good)"
  const accent = n === 1 ? "var(--cyan)" : "var(--teal)"
  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Chiller {n}</h3>
        <span className="statechip" style={{ marginBottom: 0, fontSize: 10, padding: "3px 9px", background: low ? "rgba(242,164,58,.14)" : "rgba(0,209,172,.14)", color: low ? "#f6c179" : "#34e3c2" }}>
          {low ? "LOW ΔT" : "RUNNING"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 14, alignItems: "center" }}>
        <ChillerStat lbl="INLET" v={fmt(inT)} u="°F" col="var(--ink-dim)" />
        <span className="mono" style={{ color: "var(--ink-faint)" }}>→</span>
        <ChillerStat lbl="OUTLET" v={fmt(outT)} u="°F" col={accent} />
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="kl" style={{ fontSize: 9 }}>ΔT</div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 600, color: dtColor, lineHeight: 1 }}>
            {fmt(dt, 2)}<small style={{ fontSize: 14, color: "var(--ink-dim)" }}>°F</small>
          </div>
        </div>
      </div>
      <div className="bar-track" style={{ marginTop: 14 }}>
        <div className="bar-fill" style={{ width: `${Math.min(100, (dt / 8) * 100)}%`, background: dtColor }} />
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8 }}>≈ {fmt(tons, 1)} tons removed</div>
    </div>
  )
}

export default function GlycolPage() {
  const [active, setActive] = useState("live")
  const [d, setD] = useState(SEED)
  const [gpm, setGpm] = useState(120)
  const [series, setSeries] = useState(() => {
    const arr = []
    for (let i = 30; i >= 0; i--) {
      arr.push({
        t: i,
        supply: +noise(SEED.tankTemp, 0.4).toFixed(2),
        c1out: +noise(SEED.c1out, 0.5).toFixed(2),
        c2out: +noise(SEED.c2out, 0.5).toFixed(2),
        press: +noise(SEED.pressure, 1.2).toFixed(2),
      })
    }
    return arr
  })
  const tick = useRef(31)

  useEffect(() => {
    const id = setInterval(() => {
      setD((p) => ({
        tankTemp: noise(SEED.tankTemp, 0.5),
        tankLevel: Math.max(0, Math.min(100, p.tankLevel - 0.02 + (Math.random() - 0.5) * 0.3)),
        c1in: noise(SEED.c1in, 0.7), c1out: noise(SEED.c1out, 0.6),
        c2in: noise(SEED.c2in, 0.7), c2out: noise(SEED.c2out, 0.6),
        plcTemp: noise(SEED.plcTemp, 1.0), pressure: noise(SEED.pressure, 1.4),
      }))
      setSeries((s) => [...s.slice(1), {
        t: tick.current++,
        supply: +noise(SEED.tankTemp, 0.4).toFixed(2),
        c1out: +noise(SEED.c1out, 0.5).toFixed(2),
        c2out: +noise(SEED.c2out, 0.5).toFixed(2),
        press: +noise(SEED.pressure, 1.2).toFixed(2),
      }])
    }, 1800)
    return () => clearInterval(id)
  }, [])

  const c1dt = d.c1in - d.c1out
  const c2dt = d.c2in - d.c2out
  const totalDt = c1dt + c2dt
  const c1tons = (gpm * 500 * c1dt * GLYCOL_FACTOR) / 12000
  const c2tons = (gpm * 500 * c2dt * GLYCOL_FACTOR) / 12000
  const totalTons = c1tons + c2tons
  const c1share = totalDt > 0 ? (c1dt / totalDt) * 100 : 50

  const TABS = [
    { id: "live", label: "Live" },
    { id: "trends", label: "Trends" },
  ]

  return (
    <>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={active === t.id ? "tab on" : "tab"} onClick={() => setActive(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="scroll">
        <DemoBanner />

        {active === "live" && (
          <>
            {/* KPI row */}
            <div className="row k4 mb">
              <KpiCard label="Glycol Supply Temp" value={fmt(d.tankTemp)} unit="°F" accent="var(--c-cold)"
                status={supplyStatus(d.tankTemp)} sub={`Setpoint ${T.supplySP}°F · band ±${T.supplyBand}`} />
              <TankCard level={d.tankLevel} status={levelStatus(d.tankLevel)} />
              <KpiCard label="System Pressure" value={fmt(d.pressure)} unit="PSI" accent="var(--teal)"
                status={pressStatus(d.pressure)} sub={`Band ${T.pressLo}–${T.pressHi} PSI`} />
              <KpiCard label="Panel / PLC Temp" value={fmt(d.plcTemp)} unit="°F" accent="var(--warn)"
                status={plcStatus(d.plcTemp)} sub={`Warn ${T.plcWarn}° · Trip ${T.plcAlarm}°`} />
            </div>

            {/* Two chillers */}
            <div className="row g2b mb">
              <ChillerCard n={1} inT={d.c1in} outT={d.c1out} dt={c1dt} tons={c1tons} />
              <ChillerCard n={2} inT={d.c2in} outT={d.c2out} dt={c2dt} tons={c2tons} />
            </div>

            {/* Cooling load + balance */}
            <div className="row mb" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)" }}>
              <div className="panel">
                <h3>Estimated cooling load <span className="tag-new">DERIVED</span></h3>
                <div className="sub">From per-chiller ΔT and flow</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span className="mono" style={{ fontSize: 40, fontWeight: 600, color: "var(--teal)" }}>{fmt(totalTons, 1)}</span>
                  <span style={{ fontSize: 15, color: "var(--ink-dim)" }}>tons refrigeration</span>
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8, lineHeight: 1.6 }}>
                  Q = GPM × 500 × ΔT × {GLYCOL_FACTOR} ÷ 12,000<br />
                  Ch1: {fmt(c1tons, 1)} t · Ch2: {fmt(c2tons, 1)} t · ΣΔT {fmt(totalDt, 2)}°F
                </div>
                <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
                  <label className="kl" htmlFor="gpm" style={{ fontSize: 10 }}>Flow / chiller</label>
                  <input id="gpm" type="range" min="20" max="300" value={gpm} onChange={(e) => setGpm(+e.target.value)}
                    style={{ flex: 1, accentColor: "var(--teal)" }} />
                  <span className="mono" style={{ fontSize: 13, width: 64, textAlign: "right" }}>{gpm} GPM</span>
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)", marginTop: 4 }}>
                  * Add a real flow-meter topic to replace this estimate.
                </div>
              </div>

              <div className="panel">
                <h3>Chiller load balance</h3>
                <div className="sub">ΔT share between circuits</div>
                <div style={{ marginTop: 4, height: 26, borderRadius: 6, overflow: "hidden", display: "flex", border: "1px solid var(--line)" }}>
                  <div style={{ width: `${c1share}%`, background: "var(--cyan)", display: "grid", placeItems: "center", transition: "width .6s" }}>
                    <span className="mono" style={{ fontSize: 11, color: "#04212e", fontWeight: 600 }}>CH1 {fmt(c1share, 0)}%</span>
                  </div>
                  <div style={{ width: `${100 - c1share}%`, background: "var(--teal)", display: "grid", placeItems: "center", transition: "width .6s" }}>
                    <span className="mono" style={{ fontSize: 11, color: "#042a25", fontWeight: 600 }}>CH2 {fmt(100 - c1share, 0)}%</span>
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 12, lineHeight: 1.7 }}>
                  An uneven split (by ΔT ratio) flags a lead/lag imbalance, a starved circuit, or a fouled
                  exchanger. Watch the trend over a shift, not a snapshot.
                </div>
              </div>
            </div>

            {/* Temperature & pressure trend */}
            <div className="panel">
              <h3>Temperature &amp; pressure trend</h3>
              <div className="sub">Supply / chiller outlets (°F) and system pressure (PSI)</div>
              <div style={{ height: 260, marginTop: 8 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" />
                    <XAxis dataKey="t" hide />
                    <YAxis yAxisId="t" domain={[24, 46]} tick={{ fill: "var(--ink-faint)", fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                    <YAxis yAxisId="p" orientation="right" domain={[15, 55]} tick={{ fill: "var(--ink-faint)", fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                    <Tooltip contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, fontFamily: "IBM Plex Mono", fontSize: 12 }} labelStyle={{ display: "none" }} />
                    <ReferenceLine yAxisId="t" y={T.supplySP} stroke="var(--cyan)" strokeDasharray="4 4" strokeOpacity={0.5} />
                    <Line yAxisId="t" type="monotone" dataKey="supply" name="Supply °F" stroke="#06DCF2" dot={false} strokeWidth={2} isAnimationActive={false} />
                    <Line yAxisId="t" type="monotone" dataKey="c1out" name="Ch1 out °F" stroke="#00D1AC" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                    <Line yAxisId="t" type="monotone" dataKey="c2out" name="Ch2 out °F" stroke="#f5a623" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                    <Line yAxisId="p" type="monotone" dataKey="press" name="PSI" stroke="#00AEE5" dot={false} strokeWidth={1.5} strokeOpacity={0.7} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="legend">
                <span><i style={{ background: "#06DCF2" }} />Supply °F</span>
                <span><i style={{ background: "#00D1AC" }} />Ch1 out °F</span>
                <span><i style={{ background: "#f5a623" }} />Ch2 out °F</span>
                <span><i style={{ background: "#00AEE5" }} />System PSI</span>
                <span><i style={{ background: "var(--cyan)", opacity: 0.5 }} />Setpoint {T.supplySP}°F</span>
              </div>
            </div>
          </>
        )}

        {active === "trends" && (
          <div className="panel">
            <h3>Supply temperature &amp; pressure · live trend</h3>
            <div className="sub">Same series, full height — 30-sample rolling window @ 1.8s</div>
            <div style={{ height: 360, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" />
                  <XAxis dataKey="t" hide />
                  <YAxis yAxisId="t" domain={[24, 46]} tick={{ fill: "var(--ink-faint)", fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                  <YAxis yAxisId="p" orientation="right" domain={[15, 55]} tick={{ fill: "var(--ink-faint)", fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                  <Tooltip contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, fontFamily: "IBM Plex Mono", fontSize: 12 }} labelStyle={{ display: "none" }} />
                  <ReferenceLine yAxisId="t" y={T.supplySP} stroke="var(--cyan)" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Line yAxisId="t" type="monotone" dataKey="supply" name="Supply °F" stroke="#06DCF2" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line yAxisId="t" type="monotone" dataKey="c1out" name="Ch1 out °F" stroke="#00D1AC" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line yAxisId="t" type="monotone" dataKey="c2out" name="Ch2 out °F" stroke="#f5a623" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line yAxisId="p" type="monotone" dataKey="press" name="PSI" stroke="#00AEE5" dot={false} strokeWidth={1.5} strokeOpacity={0.7} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
