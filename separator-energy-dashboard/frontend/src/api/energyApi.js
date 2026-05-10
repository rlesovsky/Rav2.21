import axios from "axios"

const api = axios.create({ baseURL: "/api" })

// In-memory response cache for the analytical endpoints.
// 30-day fetches pull ~170K points from the historian and take real time;
// caching means subsequent window toggles are instant.
//
// Live-data endpoints (/current, /timeline) are NOT cached.
//
// Manual refresh from the UI calls clearCache() to bust everything.
const CACHE_TTL_MS = 30_000
const cache = new Map()

function makeKey(path, params) {
  const search = new URLSearchParams(params).toString()
  return search ? `${path}?${search}` : path
}

async function getCached(path, params) {
  const key = makeKey(path, params)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) {
    return hit.value
  }
  const res = await api.get(path, { params })
  cache.set(key, { t: Date.now(), value: res })
  return res
}

export const clearCache = () => cache.clear()

// Cached — analytical, window-aware.
export const fetchSummary = ({ days, offset } = {}) =>
  getCached("/energy/summary", cleanParams({ days, offset }))

export const fetchDaily = ({ days, offset } = {}) =>
  getCached("/energy/daily", cleanParams({ days, offset }))

// Live — no caching.
export const fetchTimeline = () => api.get("/energy/timeline")
export const fetchCurrent = () => api.get("/energy/current")
export const fetchConfig = () => api.get("/config")
export const updateConfig = (cfg) => api.post("/config", cfg)

function cleanParams(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v != null) out[k] = v
  }
  return out
}
