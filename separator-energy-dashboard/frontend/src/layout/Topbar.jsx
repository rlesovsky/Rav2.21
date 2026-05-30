// Topbar — matches the mockup .topbar: breadcrumb (Driftwood Dairy › {title}),
// a visual-only search box, a refresh icon button (spins while refreshing and
// calls the lifted onRefresh), a live Pacific-time clock ticking every second,
// and the "System online" pill.
import { useEffect, useState } from "react"

const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "America/Los_Angeles",
})

function usePacificClock() {
  const [now, setNow] = useState(() => TIME_FMT.format(new Date()))
  useEffect(() => {
    const id = setInterval(() => setNow(TIME_FMT.format(new Date())), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function Topbar({ title, onRefresh, isRefreshing }) {
  const clock = usePacificClock()

  return (
    <div className="topbar">
      <div className="crumb">
        <span>Driftwood Dairy</span>
        <span className="sep">›</span>
        <span className="cur">{title}</span>
      </div>
      <div className="tb-right">
        <div className="search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input placeholder="Search assets, tags…" />
        </div>
        <button
          type="button"
          className={`iconbtn${isRefreshing ? " spin" : ""}`}
          title="Refresh"
          onClick={onRefresh}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 4v5h-5" />
          </svg>
        </button>
        <div className="clock">
          <div className="l">Plant · PT</div>
          <div className="t mono">{clock}</div>
        </div>
        <span className="pill"><span className="live-dot" /> System online</span>
      </div>
    </div>
  )
}
