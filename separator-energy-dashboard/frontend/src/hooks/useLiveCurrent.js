// useLiveCurrent — single-source hook for /api/energy/current.
//
// Polls every 5s (matches the backend processing loop tick). Owner component
// (App.jsx) holds it once and threads `current` + `lastFetch` to whichever
// children render live values, so we don't have N components hammering the
// endpoint.
import { useEffect, useState } from "react"
import { fetchCurrent } from "../api/energyApi"

const POLL_MS = 5000

export function useLiveCurrent(refreshKey) {
  const [data, setData] = useState(null)
  const [lastFetch, setLastFetch] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      try {
        const res = await fetchCurrent()
        if (cancelled) return
        setData(res.data)
        setLastFetch(Date.now())
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load")
      }
    }

    tick()
    const id = setInterval(tick, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [refreshKey])

  return { data, lastFetch, error }
}

// Live-updating "X seconds ago" — re-renders every second without re-fetching.
export function useRelativeTime(timestamp) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!timestamp) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [timestamp])
  if (!timestamp) return "—"
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}
