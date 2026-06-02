// AppLayout — the .dv-app grid (sidebar + main). Owns the refresh state: the
// Topbar refresh button clears the API cache and bumps refreshKey, which is
// provided to all routed pages via RefreshContext. Breadcrumb title is derived
// from the active route.
import { useCallback, useState } from "react"
import { Outlet, useLocation } from "react-router-dom"
import Sidebar from "./Sidebar"
import Topbar from "./Topbar"
import { RefreshContext } from "./RefreshContext"
import { clearCache } from "../api/energyApi"
import { ASSETS } from "../config/assetRegistry"

function titleForPath(pathname) {
  if (pathname === "/") return "Plant Overview"
  if (pathname.startsWith("/reports")) return "Reports"
  if (pathname.startsWith("/settings")) return "Settings"
  const asset = ASSETS.find((a) => pathname.startsWith(a.route))
  if (asset) return asset.name
  return "Plant Overview"
}

export default function AppLayout() {
  const location = useLocation()
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = useCallback(() => {
    clearCache()
    setIsRefreshing(true)
    setRefreshKey((k) => k + 1)
    setTimeout(() => setIsRefreshing(false), 900)
  }, [])

  const title = titleForPath(location.pathname)

  return (
    <div className="dv-app">
      <Sidebar />
      <div className="main">
        <Topbar title={title} onRefresh={handleRefresh} isRefreshing={isRefreshing} />
        <RefreshContext.Provider value={{ refreshKey }}>
          <Outlet />
        </RefreshContext.Provider>
      </div>
    </div>
  )
}
