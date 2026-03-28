export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export function formatRate(perSec: number): string {
  if (perSec < 1000) return `${perSec.toFixed(1)}/s`
  if (perSec < 1_000_000) return `${(perSec / 1000).toFixed(1)}K/s`
  return `${(perSec / 1_000_000).toFixed(2)}M/s`
}

export function formatNumber(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export function formatSimTime(ticks: number, tickRateMs: number): string {
  const ms = ticks * tickRateMs
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const remaining = s % 60
  return `${String(m).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}
