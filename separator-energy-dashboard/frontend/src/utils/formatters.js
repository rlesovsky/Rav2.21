// =============================================================================
// formatters.js — small numeric helpers shared across components
//
// The dashboard is sentence case and uses tabular numerals. Keep formatters
// numeric-only and let component layout decide what unit suffix to render.
// =============================================================================

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const decimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export const formatCurrency = (val) => usd.format(val ?? 0)
export const formatNumber = (val) => decimal.format(val ?? 0)

// Single-line variants used inside chart tooltips and tables where the unit
// is not already implied by a label.
export const formatKwh = (val) => `${decimal.format(val ?? 0)} kWh`
export const formatKw = (val) => `${decimal.format(val ?? 0)} kW`
export const formatHours = (val) => `${decimal.format(val ?? 0)} hrs`
export const formatPercent = (val) => `${decimal.format(val ?? 0)}%`
export const formatRate = (val) => `${usd.format(val ?? 0)}/kWh`
