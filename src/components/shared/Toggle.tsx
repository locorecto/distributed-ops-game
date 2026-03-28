import { InfoTooltip } from './InfoTooltip'

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
  tooltip?: string
}

export function Toggle({ label, checked, onChange, description, tooltip }: ToggleProps) {
  return (
    <label className="flex items-center justify-between cursor-pointer gap-2">
      <div>
        <div className="text-xs text-slate-200 flex items-center">
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </div>
        {description && <div className="text-xs text-slate-500">{description}</div>}
      </div>
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-blue-600' : 'bg-slate-600'}`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </div>
    </label>
  )
}
