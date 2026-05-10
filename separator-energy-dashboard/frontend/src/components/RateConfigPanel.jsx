import { useState, useEffect } from "react"
import { fetchConfig, updateConfig } from "../api/energyApi"
import { Settings, ChevronDown } from "lucide-react"

export default function RateConfigPanel({ refreshKey, onRefreshComplete }) {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({ rate_per_kwh: 0.3, voltage: 460, power_factor: 0.88 })

  useEffect(() => {
    fetchConfig()
      .then((res) => {
        setConfig(res.data)
        setForm({
          rate_per_kwh: res.data.rate_per_kwh ?? 0.3,
          voltage: res.data.voltage ?? 460,
          power_factor: res.data.power_factor ?? 0.88,
        })
      })
      .catch((err) => setError(err.message || "Failed to load"))
      .finally(() => {
        setLoading(false)
        onRefreshComplete?.()
      })
  }, [refreshKey, onRefreshComplete])

  useEffect(() => {
    if (toast == null) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  const handleSave = () => {
    const rate = Number(form.rate_per_kwh)
    const voltage = Number(form.voltage)
    const pf = Number(form.power_factor)
    if (rate < 0.01 || rate > 2) return setToast({ type: "error", message: "Rate must be between 0.01 and 2.00" })
    if (voltage < 100 || voltage > 600) return setToast({ type: "error", message: "Voltage must be between 100 and 600" })
    if (pf < 0.5 || pf > 1) return setToast({ type: "error", message: "Power factor must be between 0.50 and 1.00" })

    setSaving(true)
    updateConfig({ rate_per_kwh: rate, voltage, power_factor: pf })
      .then(() => {
        setToast({ type: "success", message: "Settings saved." })
        setConfig((c) => ({ ...c, rate_per_kwh: rate, voltage, power_factor: pf }))
      })
      .catch((err) => setToast({ type: "error", message: err.response?.data?.detail ?? err.message ?? "Save failed" }))
      .finally(() => setSaving(false))
  }

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen((o) => !o)}
        disabled={loading && !config}
      >
        <span className="flex items-center gap-2 text-sm text-gray-300">
          <Settings className="h-4 w-4 text-gray-500" />
          Rate &amp; electrical config
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {error && !config && (
        <div className="px-4 pb-3 text-sm text-red-400">Error: {error}</div>
      )}

      {open && config && (
        <div className="px-4 pb-4 pt-1 border-t border-white/[0.06]">
          <p className="text-xs text-gray-500 mb-3">
            This updates the flat fallback rate. TOU rates are configured server-side.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <NumField
              label="$/kWh rate"
              value={form.rate_per_kwh}
              step="0.01" min="0.01" max="2"
              onChange={(v) => setForm((f) => ({ ...f, rate_per_kwh: v }))}
            />
            <NumField
              label="Voltage"
              value={form.voltage}
              min="100" max="600"
              onChange={(v) => setForm((f) => ({ ...f, voltage: v }))}
            />
            <NumField
              label="Power factor"
              value={form.power_factor}
              step="0.01" min="0.5" max="1"
              onChange={(v) => setForm((f) => ({ ...f, power_factor: v }))}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {toast && (
              <span className={`text-xs ${toast.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                {toast.message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NumField({ label, value, onChange, step, min, max }) {
  return (
    <div>
      <label className="block label mb-1">{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="num w-full rounded-md border border-white/[0.10] bg-black px-3 py-2 text-sm text-white focus:border-cyan-500/40 focus:outline-none"
      />
    </div>
  )
}
