/* =============================================================================
 * AppLayout — DriftView application shell (spec §3.1 / §4.1).
 *
 * Owns the two-region frame: persistent left rail + main column (sticky context
 * bar above a scrollable content region). The active route renders into the
 * content region via <Outlet>. The context-bar breadcrumb title is derived from
 * the current path against the asset registry.
 * ============================================================================= */

import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import ContextBar from './ContextBar'
import { ASSETS } from '../config/assetRegistry'

function titleForPath(pathname) {
  if (pathname === '/' || pathname === '') return 'Fleet Overview'
  const asset = ASSETS.find((a) => pathname.startsWith(a.path))
  if (asset) return asset.name
  if (pathname.startsWith('/settings')) return 'Settings'
  if (pathname.startsWith('/reports')) return 'Reports'
  return 'DriftView'
}

export default function AppLayout() {
  const { pathname } = useLocation()
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, var(--dv-bg-0), var(--dv-bg-1))',
        color: 'var(--dv-ink)',
        fontFamily: 'var(--dv-font-ui)',
      }}
    >
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ContextBar pageTitle={titleForPath(pathname)} />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {/* key on pathname so the fade-in replays on each navigation */}
          <div key={pathname} className="dv-page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
