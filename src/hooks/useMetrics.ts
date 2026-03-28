import { useMetricsStore } from '../store/metricsStore'
import type { MetricsDataPoint } from '../engine/types'

export function useMetricsHistory(): MetricsDataPoint[] {
  return useMetricsStore((s) => s.history)
}

export function useLatestMetrics(): MetricsDataPoint | null {
  return useMetricsStore((s) => s.history[s.history.length - 1] ?? null)
}
