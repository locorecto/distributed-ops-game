import { create } from 'zustand'
import type { SimulationSnapshot } from '../engine/types'

interface SimulationStoreState {
  snapshot: SimulationSnapshot | null
  isRunning: boolean
  speed: 1 | 2 | 4
  setSnapshot(s: SimulationSnapshot): void
  setRunning(r: boolean): void
  setSpeed(s: 1 | 2 | 4): void
  clear(): void
}

export const useSimulationStore = create<SimulationStoreState>((set) => ({
  snapshot: null,
  isRunning: false,
  speed: 1,
  setSnapshot: (s) => set({ snapshot: s }),
  setRunning: (r) => set({ isRunning: r }),
  setSpeed: (s) => set({ speed: s }),
  clear: () => set({ snapshot: null, isRunning: false }),
}))
