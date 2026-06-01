// Sidebar — matches the mockup .sidebar exactly: brand lockup (real logo mark
// + two-tone DriftView wordmark + tagline), Monitoring section (Plant Overview +
// the registry assets), Operations section (Reports / Settings), and the
// pinned site picker. Nav items are React Router NavLinks using the mockup's
// .navitem / .navitem.on active styling.
import { NavLink } from "react-router-dom"
import { ASSETS } from "../config/assetRegistry"

function navClass({ isActive }) {
  return isActive ? "navitem on" : "navitem"
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <img src="/dv-mark.png" alt="DriftView" />
        <div>
          <div className="wm">
            <span className="d">Drift</span><span className="v">View</span>
          </div>
          <div className="tg">Industrial Data Visibility</div>
        </div>
      </div>

      <div className="sb-sect">Monitoring</div>

      <NavLink to="/" end className={navClass}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        Plant Overview
      </NavLink>

      {ASSETS.map((asset) => {
        const { NavIcon } = asset
        return (
          <NavLink key={asset.id} to={asset.route} className={navClass}>
            <NavIcon />
            {asset.name}
            <span className="dot" style={{ background: asset.dotColor }} />
          </NavLink>
        )
      })}

      <div className="sb-sect">Operations</div>

      <NavLink to="/reports" className={navClass}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h5" />
        </svg>
        Reports
      </NavLink>

      <NavLink to="/settings" className={navClass}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17 2 2 0 0 1-4 0 1.65 1.65 0 0 0-2.82-1.17l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.4l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V4a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9H20a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Settings
      </NavLink>

      <div className="sb-foot">
        <div className="sitepick">
          <div className="ico">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h2M13 9h2M9 13h2M13 13h2" />
            </svg>
          </div>
          <div>
            <div className="nm">Driftwood Dairy</div>
            <div className="lc">El Monte, CA · 1 site</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
