import { useState, useEffect } from "react"
import { RefreshCw, Zap } from "lucide-react"

export default function Header({ onRefresh, isRefreshing }) {
  const [time, setTime] = useState(() => formatTime(new Date()))

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="card p-5 shrink-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
            style={{ backgroundColor: "rgba(34, 211, 238, 0.10)" }}
          >
            <Zap className="h-5 w-5" style={{ color: "#22d3ee" }} />
          </div>
          <div className="min-w-0">
            <div className="label">Energy overview</div>
            <h1 className="mt-0.5 text-xl font-semibold leading-tight text-white">
              Driftwood Separator
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              El Monte, CA · SCE TOU-GS-2
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh data"
            className="rounded-lg border border-white/[0.08] p-1.5 text-gray-400 hover:border-white/[0.14] hover:text-white disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
          <span className="num text-sm text-gray-300">{time}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm text-gray-400">System online</span>
          </span>
        </div>
      </div>
    </header>
  )
}

function formatTime(d) {
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
