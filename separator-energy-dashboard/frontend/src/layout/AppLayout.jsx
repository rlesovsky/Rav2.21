/* =============================================================================
 * AppLayout — DriftView application shell (spec §3.1 / §4.1).
 *
 * Owns the two-region frame: persistent left rail + main column (sticky context
 * bar above a scrollable content region). Phase 1 renders its children directly
 * in the content region; Phase 2 replaces children with the router <Outlet>.
 * ============================================================================= */

import Sidebar from './Sidebar'
import ContextBar from './ContextBar'

export default function AppLayout({ children, pageTitle }) {
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
        <ContextBar pageTitle={pageTitle} />
        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  )
}
