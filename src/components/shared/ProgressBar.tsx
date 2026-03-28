interface ProgressBarProps {
  value: number    // 0–100
  color?: string
  height?: number
  showLabel?: boolean
}

export function ProgressBar({ value, color = '#3b82f6', height = 6, showLabel = false }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 rounded-full overflow-hidden" style={{ height, backgroundColor: '#1e293b' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && <span className="text-xs font-mono text-slate-300 w-8 text-right">{Math.round(clamped)}%</span>}
    </div>
  )
}
