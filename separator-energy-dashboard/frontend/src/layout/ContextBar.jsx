/* =============================================================================
 * ContextBar — sticky top bar of the main column (spec §4.3).
 *
 * Absorbs the retired Header's responsibilities: live clock, refresh trigger,
 * and the system-online indicator. Adds a breadcrumb and a placeholder search
 * field (wiring optional for v1). The refresh button drives the shared
 * RefreshContext rather than a local callback count.
 * ============================================================================= */

import { useEffect, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { useRefresh } from '../context/RefreshContext'

function useClock() {
  const fmt = () =>
    new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Los_Angeles',
    })
  const [time, setTime] = useState(fmt)
  useEffect(() => {
    const id = setInterval(() => setTime(fmt()), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

export default function ContextBar({ pageTitle = 'Separator' }) {
  const { triggerRefresh, isRefreshing } = useRefresh()
  const time = useClock()

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b px-6 py-3 backdrop-blur-xl"
      style={{
        background: 'color-mix(in srgb, var(--dv-panel-2) 80%, transparent)',
        borderColor: 'var(--dv-line-2)',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span style={{ color: 'var(--dv-faint)' }}>Driftwood Dairy</span>
        <span style={{ color: 'var(--dv-faint)' }}>›</span>
        <span style={{ color: 'var(--dv-ink)' }} className="font-medium">
          {pageTitle}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Search placeholder (visual only for v1) */}
        <div
          className="hidden items-center gap-2 rounded-lg border px-3 py-1.5 md:flex"
          style={{ borderColor: 'var(--dv-line)', background: 'var(--dv-panel)' }}
        >
          <Search size={14} style={{ color: 'var(--dv-faint)' }} />
          <input
            type="text"
            placeholder="Search…"
            disabled
            className="w-32 bg-transparent text-sm outline-none placeholder:opacity-60"
            style={{ color: 'var(--dv-dim)' }}
          />
        </div>

        {/* Refresh */}
        <button
          type="button"
          onClick={triggerRefresh}
          disabled={isRefreshing}
          aria-label="Refresh data"
          className="rounded-lg border p-2 transition-colors disabled:opacity-70"
          style={{ borderColor: 'var(--dv-line)', background: 'var(--dv-panel)' }}
        >
          <RefreshCw
            size={18}
            className={isRefreshing ? 'animate-spin' : ''}
            style={{ color: 'var(--dv-dim)' }}
          />
        </button>

        {/* Live clock (Pacific) */}
        <span
          className="text-sm"
          style={{ fontFamily: 'var(--dv-font-mono)', color: 'var(--dv-dim)' }}
        >
          {time}
        </span>

        {/* System-online pill */}
        <div
          className="flex items-center gap-2 rounded-full border px-3 py-1"
          style={{ borderColor: 'var(--dv-line)', background: 'var(--dv-panel)' }}
        >
          <span
            className="h-2 w-2 animate-pulse rounded-full"
            style={{ background: 'var(--dv-state-processing)' }}
          />
          <span className="text-xs" style={{ color: 'var(--dv-dim)' }}>
            System Online
          </span>
        </div>
      </div>
    </header>
  )
}
