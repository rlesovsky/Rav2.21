// GlycolPage — PREVIEW ONLY. There is no real glycol-chiller data source yet,
// so every number and chart on this page is static demo content ported from the
// mockup. A prominent DEMO banner makes that explicit. Tab state is local (the
// route does not encode it) since none of it is real.
import { useState } from "react"

const TABS = [
  { id: "live", label: "Live" },
  { id: "analysis", label: "Analysis" },
  { id: "trends", label: "Trends" },
  { id: "alarms", label: "Alarms" },
]

function DemoBanner() {
  return (
    <div
      className="panel mb"
      style={{ borderColor: "var(--c-idle)", background: "rgba(242,164,58,.08)" }}
    >
      <h3 style={{ color: "#f6c179" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "0 0 auto" }}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        Demo / preview data
      </h3>
      <div className="sub" style={{ marginBottom: 0 }}>
        The Glycol Chiller is not yet connected to a live source. Every value and chart
        below is static placeholder content to preview the layout — do not treat it as real.
      </div>
    </div>
  )
}

function LiveTab() {
  return (
    <div className="row g2b mb">
      <div className="panel">
        <h3>Live chiller telemetry <span className="tag-new">DEMO</span></h3>
        <div className="sub">Preview · no live source</div>
        <span className="statechip" style={{ background: "rgba(63,182,232,.14)", color: "#7fd3f3" }}>
          <span className="live-dot" style={{ background: "var(--c-cold)" }} />Cooling · 2 of 3 compressors staged
        </span>
        <div className="telem">
          <div className="tcell"><div className="tl">Glycol Supply</div><div className="tv" style={{ color: "#7fd3f3" }}>28.4<small> °F</small></div><div className="bar-track"><div className="bar-fill" style={{ width: "30%", background: "linear-gradient(90deg,#3fb6e8,#7fd3f3)" }} /></div></div>
          <div className="tcell"><div className="tl">Glycol Return</div><div className="tv" style={{ color: "#f6c179" }}>34.1<small> °F</small></div><div className="bar-track"><div className="bar-fill" style={{ width: "48%", background: "linear-gradient(90deg,#f2a43a,#ef8a5a)" }} /></div></div>
          <div className="tcell"><div className="tl">Flow Rate</div><div className="tv">118<small> gpm</small></div><div className="bar-track"><div className="bar-fill" style={{ width: "62%", background: "linear-gradient(90deg,var(--blue),var(--teal))" }} /></div></div>
          <div className="tcell"><div className="tl">Compressor Power</div><div className="tv">42.6<small> kW</small></div><div className="bar-track"><div className="bar-fill" style={{ width: "67%", background: "linear-gradient(90deg,var(--blue),#7fd3f3)" }} /></div></div>
        </div>
      </div>
      <div className="panel">
        <h3>Glycol ΔT &amp; COP</h3>
        <div className="sub">Cooling effectiveness right now</div>
        <div className="row g2b" style={{ marginTop: 6, gap: 14 }}>
          <div style={{ textAlign: "center" }}>
            <svg viewBox="0 0 120 80" width="100%" height="120">
              <path d="M15,70 A45,45 0 0 1 105,70" fill="none" stroke="#0a182f" strokeWidth="11" strokeLinecap="round" />
              <path d="M15,70 A45,45 0 0 1 86,30" fill="none" stroke="#3fb6e8" strokeWidth="11" strokeLinecap="round" />
            </svg>
            <div className="kv mono" style={{ color: "#7fd3f3", marginTop: -26 }}>5.7<small> °F</small></div>
            <div className="cap" style={{ color: "var(--ink-faint)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", marginTop: 6 }}>Glycol ΔT</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <svg viewBox="0 0 120 80" width="100%" height="120">
              <path d="M15,70 A45,45 0 0 1 105,70" fill="none" stroke="#0a182f" strokeWidth="11" strokeLinecap="round" />
              <path d="M15,70 A45,45 0 0 1 92,24" fill="none" stroke="#27c281" strokeWidth="11" strokeLinecap="round" />
            </svg>
            <div className="kv mono" style={{ color: "#5fdca6", marginTop: -26 }}>3.8</div>
            <div className="cap" style={{ color: "var(--ink-faint)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", marginTop: 6 }}>System COP</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ tintBg, icon, label, value, unit, valueColor, delta, spark }) {
  return (
    <div className="card">
      <div className="ct">
        <span className="badge-i" style={{ background: tintBg }}>{icon}</span>
        <span className="info">ⓘ</span>
      </div>
      <div className="kl">{label}</div>
      <div className="kv" style={{ color: valueColor }}>{value}{unit && <small>{unit}</small>}</div>
      {delta}
      {spark}
    </div>
  )
}

function AnalysisTab() {
  return (
    <>
      <div className="row k5 mb">
        <Card
          tintBg="rgba(63,182,232,.14)"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3fb6e8" strokeWidth="2"><path d="M12 2v14M9 19a3 3 0 1 0 6 0c0-2-3-5-3-5s-3 3-3 5z" /></svg>}
          label="Glycol Supply" value="28.4" unit="°F" valueColor="#7fd3f3"
          delta={<div className="delta good"><span>●</span><span className="v">On setpoint</span></div>}
          spark={<svg className="spark" viewBox="0 0 110 42" preserveAspectRatio="none"><polyline points="0,20 18,18 36,22 55,19 73,21 92,18 110,20" fill="none" stroke="#3fb6e8" strokeWidth="2" /></svg>}
        />
        <Card
          tintBg="rgba(239,138,90,.14)"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ef8a5a" strokeWidth="2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>}
          label="Glycol Return" value="34.1" unit="°F" valueColor="#f6b27f"
          delta={<div className="delta good"><span>▼</span><span className="v">0.4°</span><span className="x">vs prev hr</span></div>}
        />
        <Card
          tintBg="rgba(43,182,179,.14)"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2bb6b3" strokeWidth="2"><path d="M8 3v18M16 3v18M3 8h18M3 16h18" /></svg>}
          label="System COP" value="3.8" valueColor="#5fdca6"
          delta={<div className="delta good"><span>▲</span><span className="v">6.2%</span><span className="x">vs prev 7d</span></div>}
        />
        <Card
          tintBg="rgba(47,134,216,.14)"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2f86d8" strokeWidth="2" strokeLinejoin="round"><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg>}
          label="Compressor Power" value="42.6" unit="kW" valueColor="#9cc6f4"
          delta={<div className="delta bad"><span>▲</span><span className="v">4.1%</span><span className="x">vs prev 7d</span></div>}
        />
        <Card
          tintBg="rgba(43,182,179,.14)"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2bb6b3" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
          label="Chiller Cost · 7-Day" value="$1,204" valueColor="#7fe3df"
          delta={<div className="delta bad"><span>▲</span><span className="v">2.8%</span><span className="x">vs prev 7d</span></div>}
        />
      </div>

      <div className="row g2 mb">
        <div className="panel">
          <h3>Glycol temperature · 24 h</h3>
          <div className="sub">Supply vs return vs setpoint (28°F)</div>
          <svg viewBox="0 0 600 240" width="100%" height="240" style={{ marginTop: 6 }}>
            <g stroke="#16294a" strokeWidth="1"><line x1="40" y1="30" x2="600" y2="30" /><line x1="40" y1="80" x2="600" y2="80" /><line x1="40" y1="130" x2="600" y2="130" /><line x1="40" y1="180" x2="600" y2="180" /></g>
            <g fill="#5f7596" fontSize="10" fontFamily="IBM Plex Mono" textAnchor="end"><text x="34" y="33">38</text><text x="34" y="83">34</text><text x="34" y="133">30</text><text x="34" y="183">26</text></g>
            <line x1="40" y1="155" x2="600" y2="155" stroke="#5b7193" strokeWidth="1.2" strokeDasharray="5 5" />
            <text x="596" y="150" fill="#8aa0bf" fontSize="9" textAnchor="end" fontFamily="IBM Plex Mono">setpoint 28°F</text>
            <polyline points="40,86 110,80 180,90 250,78 320,84 390,76 460,88 530,80 600,82" fill="none" stroke="#ef8a5a" strokeWidth="2.4" />
            <polyline points="40,150 110,148 180,156 250,150 320,152 390,146 460,154 530,150 600,151" fill="none" stroke="#3fb6e8" strokeWidth="2.4" />
          </svg>
          <div className="legend"><span><i style={{ background: "#3fb6e8" }} />Supply</span><span><i style={{ background: "#ef8a5a" }} />Return</span><span><i style={{ background: "#5b7193" }} />Setpoint</span></div>
        </div>
        <div className="panel">
          <h3>Compressor staging &amp; runtime</h3>
          <div className="sub">7-day run hours per compressor</div>
          <svg viewBox="0 0 320 220" width="100%" height="220">
            <g stroke="#16294a" strokeWidth="1"><line x1="44" y1="20" x2="320" y2="20" /><line x1="44" y1="65" x2="320" y2="65" /><line x1="44" y1="110" x2="320" y2="110" /><line x1="44" y1="155" x2="320" y2="155" /><line x1="44" y1="190" x2="320" y2="190" /></g>
            <g fill="#5f7596" fontSize="9" fontFamily="IBM Plex Mono" textAnchor="end"><text x="38" y="23">160h</text><text x="38" y="68">120h</text><text x="38" y="113">80h</text><text x="38" y="158">40h</text><text x="38" y="193">0</text></g>
            <rect x="72" y="40" width="48" height="150" fill="#3fb6e8" rx="2" />
            <rect x="142" y="70" width="48" height="120" fill="#2f86d8" rx="2" />
            <rect x="212" y="130" width="48" height="60" fill="#2bb6b3" rx="2" />
            <g fill="#9fb4d2" fontSize="10" textAnchor="middle"><text x="96" y="205">Comp 1</text><text x="166" y="205">Comp 2</text><text x="236" y="205">Comp 3</text></g>
          </svg>
        </div>
      </div>

      <div className="panel">
        <h3>Chiller cost — last 7 days</h3>
        <div className="sub">Stacked by TOU period · SCE TOU-GS-2</div>
        <svg viewBox="0 0 980 220" width="100%" height="220">
          <g stroke="#16294a" strokeWidth="1"><line x1="48" y1="20" x2="980" y2="20" /><line x1="48" y1="68" x2="980" y2="68" /><line x1="48" y1="116" x2="980" y2="116" /><line x1="48" y1="164" x2="980" y2="164" /><line x1="48" y1="190" x2="980" y2="190" /></g>
          <g fill="#5f7596" fontSize="10" fontFamily="IBM Plex Mono" textAnchor="end"><text x="42" y="24">$240</text><text x="42" y="72">$180</text><text x="42" y="120">$120</text><text x="42" y="168">$60</text><text x="42" y="193">$0</text></g>
          <g><rect x="80" y="78" width="86" height="112" fill="#3fb6e8" rx="2" /><rect x="80" y="60" width="86" height="18" fill="#ef8a5a" rx="2" /></g>
          <g><rect x="200" y="84" width="86" height="106" fill="#3fb6e8" rx="2" /><rect x="200" y="66" width="86" height="18" fill="#ef8a5a" rx="2" /></g>
          <g><rect x="320" y="72" width="86" height="118" fill="#3fb6e8" rx="2" /><rect x="320" y="52" width="86" height="20" fill="#ef8a5a" rx="2" /></g>
          <g><rect x="440" y="66" width="86" height="124" fill="#3fb6e8" rx="2" /><rect x="440" y="44" width="86" height="22" fill="#ef8a5a" rx="2" /></g>
          <g><rect x="560" y="60" width="86" height="130" fill="#3fb6e8" rx="2" /><rect x="560" y="38" width="86" height="22" fill="#ef8a5a" rx="2" /></g>
          <g><rect x="680" y="58" width="86" height="132" fill="#3fb6e8" rx="2" /><rect x="680" y="34" width="86" height="24" fill="#ef8a5a" rx="2" /></g>
          <g><rect x="800" y="74" width="86" height="116" fill="#3fb6e8" rx="2" /><rect x="800" y="54" width="86" height="20" fill="#ef8a5a" rx="2" /></g>
          <g fill="#9fb4d2" fontSize="11.5" textAnchor="middle"><text x="123" y="210">May 22</text><text x="243" y="210">May 23</text><text x="363" y="210">May 24</text><text x="483" y="210">May 25</text><text x="603" y="210">May 26</text><text x="723" y="210">May 27</text><text x="843" y="210">May 28</text></g>
        </svg>
        <div className="legend"><span><i style={{ background: "#3fb6e8" }} />Off / Mid-Peak</span><span><i style={{ background: "#ef8a5a" }} />On-Peak</span></div>
      </div>
    </>
  )
}

function TrendsTab() {
  return (
    <div className="panel">
      <h3>COP trend · 7 days</h3>
      <div className="sub">Coefficient of performance, hourly average</div>
      <svg viewBox="0 0 980 240" width="100%" height="240" style={{ marginTop: 6 }}>
        <g stroke="#16294a" strokeWidth="1"><line x1="48" y1="40" x2="980" y2="40" /><line x1="48" y1="100" x2="980" y2="100" /><line x1="48" y1="160" x2="980" y2="160" /><line x1="48" y1="200" x2="980" y2="200" /></g>
        <defs><linearGradient id="glyG2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#27c281" stopOpacity=".35" /><stop offset="1" stopColor="#27c281" stopOpacity="0" /></linearGradient></defs>
        <path d="M48,120 L160,110 L280,130 L400,96 L520,104 L640,84 L760,100 L880,90 L980,96 L980,200 L48,200 Z" fill="url(#glyG2)" />
        <polyline points="48,120 160,110 280,130 400,96 520,104 640,84 760,100 880,90 980,96" fill="none" stroke="#27c281" strokeWidth="2.5" />
        <g fill="#5f7596" fontSize="10" fontFamily="IBM Plex Mono" textAnchor="end"><text x="42" y="43">4.5</text><text x="42" y="103">3.8</text><text x="42" y="163">3.1</text></g>
      </svg>
    </div>
  )
}

function AlarmsTab() {
  return (
    <div className="panel">
      <h3>Glycol chiller alarms <span className="tag-new">DEMO</span></h3>
      <div className="sub">Static sample rows — no real alarm source connected</div>
      <table className="dv-table">
        <thead><tr><th>Severity</th><th>Message</th><th>Time</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td><span className="sev crit">CRITICAL</span></td><td>Glycol supply temp above 30°F for &gt; 10 min</td><td className="mono">07:55:18</td><td><span className="st-tag active">● Active</span></td></tr>
          <tr><td><span className="sev warn">WARN</span></td><td>Compressor 3 short-cycling (4 starts / 15 min)</td><td className="mono">05:31:02</td><td><span className="st-tag ack">Acknowledged</span></td></tr>
          <tr><td><span className="sev info">INFO</span></td><td>Compressor 2 staged on</td><td className="mono">04:12:44</td><td><span className="st-tag cleared">Cleared</span></td></tr>
        </tbody>
      </table>
    </div>
  )
}

export default function GlycolPage() {
  const [active, setActive] = useState("analysis")
  return (
    <>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={active === t.id ? "tab on" : "tab"} onClick={() => setActive(t.id)}>
            {t.label}{t.id === "alarms" && <span className="badge">1</span>}
          </button>
        ))}
      </div>
      <div className="scroll">
        <DemoBanner />
        {active === "live" && <LiveTab />}
        {active === "analysis" && <AnalysisTab />}
        {active === "trends" && <TrendsTab />}
        {active === "alarms" && <AlarmsTab />}
      </div>
    </>
  )
}
