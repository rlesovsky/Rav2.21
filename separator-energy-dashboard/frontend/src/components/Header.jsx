import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'

export default function Header({ onRefresh, isRefreshing }) {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }))

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800">
      <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-white rounded-lg px-3 py-1.5">
            <img src="/driftwood-logo.png" alt="Driftwood Dairy" className="h-10 w-auto" />
          </div>
          <div>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              Separator Energy Dashboard — 7-Day Cost Analysis
            </h1>
            <p className="text-sm text-slate-500">Driftwood Dairy — El Monte, CA | SCE TOU-GS-2 | Rolling 7-Day Window</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="bg-slate-700/50 hover:bg-slate-600/50 rounded-lg p-2 disabled:opacity-70 transition-colors"
            aria-label="Refresh data"
          >
            <RefreshCw className={`w-5 h-5 text-slate-300 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <span className="font-mono text-slate-300 text-sm">{time}</span>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-slate-400 text-sm">System Online</span>
        </div>
      </div>
    </header>
  )
}
