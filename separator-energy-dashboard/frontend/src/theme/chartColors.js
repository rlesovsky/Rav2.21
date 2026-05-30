/* =============================================================================
 * Chart color palette — DriftView theme (spec §6.1 / §6.4).
 *
 * Single source of truth for Recharts series/state colors so the existing chart
 * components draw from the same palette as the shell. Operating-state colors are
 * kept semantic (green = Processing reads as "running" at a glance); blue/teal
 * carry the brand in chrome and accents.
 *
 * These are raw hex (not CSS var() references) because Recharts props such as
 * `fill`/`stroke` are passed to SVG attributes and canvas, which do not resolve
 * CSS custom properties reliably. The values mirror tokens.css.
 * ============================================================================= */

// Operating-state semantics — must match tokens.css --dv-state-*
export const STATE_COLORS = {
  Processing: '#27c281',
  CIP: '#2f86d8',
  Idle: '#f2a43a',
  Shutdown: '#5b7193',
}

// Brand
export const BRAND = {
  navy: '#1c4e8a',
  blue: '#2f86d8',
  teal: '#2bb6b3',
}

// Chart chrome (axes, grid, tooltip) — mirror the dark-theme tokens
export const CHART = {
  grid: '#1c3253', // --dv-line
  axis: '#67809f', // --dv-faint
  label: '#9fb4d2', // --dv-dim
  tooltipBg: '#0b1a33', // --dv-panel-2
  tooltipBorder: '#1c3253', // --dv-line
  ink: '#e8f0fb', // --dv-ink
}
