import { InfoTooltip } from './InfoTooltip'

interface SelectProps {
  label: string
  value: string | number
  options: { label: string; value: string | number }[]
  onChange: (value: string) => void
  tooltip?: string
}

export function Select({ label, value, options, onChange, tooltip }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400 flex items-center">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
