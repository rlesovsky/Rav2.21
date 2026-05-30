// App — DriftView routing. All routes render inside AppLayout (sidebar + topbar
// + breadcrumb). Only the Separator asset is wired to the real API; the others
// are clearly-labeled demo/preview pages. Unknown routes redirect to Fleet.
import { Routes, Route, Navigate } from "react-router-dom"
import AppLayout from "./layout/AppLayout"
import FleetOverview from "./pages/FleetOverview"
import SeparatorPage from "./pages/SeparatorPage"
import GlycolPage from "./pages/GlycolPage"
import PasteurizerPage from "./pages/PasteurizerPage"
import AlarmsPage from "./pages/AlarmsPage"
import Reports from "./pages/Reports"
import Settings from "./pages/Settings"

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<FleetOverview />} />
        <Route path="asset/separator/:tab?" element={<SeparatorPage />} />
        <Route path="asset/glycol/:tab?" element={<GlycolPage />} />
        <Route path="asset/pasteurizer" element={<PasteurizerPage />} />
        <Route path="alarms" element={<AlarmsPage />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
