/* =============================================================================
 * App — DriftView router (Phase 2).
 *
 * Mounts the route tree under the shared RefreshProvider and the AppLayout
 * shell. Routes are: Fleet Overview (index), the Separator asset page, Settings,
 * and Reports. The Separator path is a prefix match (`/*`) so Phase 3 can add
 * nested tab routes (Live / Analysis / Trends) under it without touching this
 * file. Unknown paths redirect to the Fleet Overview.
 * ============================================================================= */

import { Routes, Route, Navigate } from 'react-router-dom'
import { RefreshProvider } from './context/RefreshContext'
import AppLayout from './layout/AppLayout'
import FleetOverview from './pages/FleetOverview'
import SeparatorPage from './pages/SeparatorPage'
import Settings from './pages/Settings'
import Reports from './pages/Reports'

export default function App() {
  return (
    <RefreshProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<FleetOverview />} />
          <Route path="asset/separator" element={<Navigate to="/asset/separator/analysis" replace />} />
          <Route path="asset/separator/:tab" element={<SeparatorPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="reports" element={<Reports />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </RefreshProvider>
  )
}
