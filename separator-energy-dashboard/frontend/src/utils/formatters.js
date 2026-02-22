export const formatCurrency = (val) => `$${(val ?? 0).toFixed(2)}`
export const formatKwh = (val) => `${(val ?? 0).toFixed(1)} kWh`
export const formatKw = (val) => `${(val ?? 0).toFixed(1)} kW`
export const formatHours = (val) => `${(val ?? 0).toFixed(1)} hrs`
export const formatPercent = (val) => `${(val ?? 0).toFixed(1)}%`
export const formatRate = (val) => `$${(val ?? 0).toFixed(2)}/kWh`
