import { useState, useEffect } from 'react'
import { fetchConfig, updateConfig } from '../api/energyApi'
import { ChevronDown, ChevronUp } from 'lucide-react'

function Skeleton() {
  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 animate-pulse">
      <div className="h-6 bg-slate-700/50 rounded w-48 mb-4" />
      <div className="h-10 bg-slate-700/50 rounded w-full" />
    </div>
  )
}

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
      .catch((err) => setError(err.message || 'Failed to load'))
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
    if (rate < 0.01 || rate > 2) {
      setToast({ type: 'error', message: 'Rate must be between 0.01 and 2.00' })
      return
    }
    if (voltage < 100 || voltage > 600) {
      setToast({ type: 'error', message: 'Voltage must be between 100 and 600' })
      return
    }
    if (pf < 0.5 || pf > 1) {
      setToast({ type: 'error', message: 'Power factor must be between 0.50 and 1.00' })
      return
    }
    setSaving(true)
    updateConfig({ rate_per_kwh: rate, voltage, power_factor: pf })
      .then(() => {
        setToast({ type: 'success', message: 'Settings saved.' })
        setConfig((c) => ({ ...c, rate_per_kwh: rate, voltage, power_factor: pf }))
      })
      .catch((err) => setToast({ type: 'error', message: err.response?.data?.detail ?? err.message ?? 'Save failed' }))
      .finally(() => setSaving(false))
  }

  if (loading && !config) return <Skeleton />
  if (error) {
    return (
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
        <button type="button" className="flex items-center justify-between w-full text-left" onClick={() => setOpen((o) => !o)}>
          <span className="text-slate-300 font-medium">Rate & Electrical Config</span>
          {open ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </button>
        <div className="text-red-400 mt-2">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
      <button
        type="button"
        className="flex items-center justify-between w-full p-4 text-left hover:bg-slate-700/20 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-slate-300 font-medium">Rate & Electrical Config</span>
        {open ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
      </button>
      {open && (
        <div className="p-4 pt-0 border-t border-slate-700/50">
          <p className="text-slate-500 text-sm mb-4">
            This updates the flat fallback rate. TOU rates are configured server-side.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-slate-500 text-sm mb-1">$/kWh rate</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="2"
                className="w-full bg-slate-700/50 rounded-lg border border-slate-600 px-3 py-2 font-mono text-slate-300"
                value={form.rate_per_kwh}
                onChange={(e) => setForm((f) => ({ ...f, rate_per_kwh: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-slate-500 text-sm mb-1">Voltage</label>
              <input
                type="number"
                min="100"
                max="600"
                className="w-full bg-slate-700/50 rounded-lg border border-slate-600 px-3 py-2 font-mono text-slate-300"
                value={form.voltage}
                onChange={(e) => setForm((f) => ({ ...f, voltage: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-slate-500 text-sm mb-1">Power Factor</label>
              <input
                type="number"
                step="0.01"
                min="0.5"
                max="1"
                className="w-full bg-slate-700/50 rounded-lg border border-slate-600 px-3 py-2 font-mono text-slate-300"
                value={form.power_factor}
                onChange={(e) => setForm((f) => ({ ...f, power_factor: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-100 rounded-lg font-medium disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {toast && (
              <span
                className={`text-sm ${toast.type === 'success' ? 'text-green-400' : 'text-red-400'}`}
              >
                {toast.message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
