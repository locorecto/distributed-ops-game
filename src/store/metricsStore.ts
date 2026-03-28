import { create } from 'zustand'
import type { MetricsDataPoint } from '../engine/types'
import { GAME } from '../constants/game'

interface MetricsStoreState {
  history: MetricsDataPoint[]
  pushDataPoint(point: MetricsDataPoint): void
  clearHistory(): void
}

export const useMetricsStore = create<MetricsStoreState>((set) => ({
  history: [],
  pushDataPoint: (point) =>
    set((state) => {
      const next = [...state.history, point]
      if (next.length > GAME.MAX_METRICS_HISTORY) next.splice(0, next.length - GAME.MAX_METRICS_HISTORY)
      return { history: next }
    }),
  clearHistory: () => set({ history: [] }),
}))
