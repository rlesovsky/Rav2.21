// Settings — hosts the real RateConfigPanel (/api/config) inside a mockup .panel
// shell. The panel's own internal styling is kept; we just wrap it for layout.
import RateConfigPanel from "../components/RateConfigPanel"
import { useRefreshKey } from "../layout/RefreshContext"

export default function Settings() {
  const refreshKey = useRefreshKey()
  return (
    <div className="scroll">
      <div className="panel">
        <h3>Rate &amp; electrical configuration</h3>
        <div className="sub">Flat fallback rate and motor electrical constants · /api/config</div>
        <RateConfigPanel refreshKey={refreshKey} />
      </div>
    </div>
  )
}
