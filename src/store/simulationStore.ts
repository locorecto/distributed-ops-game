import { create } from 'zustand'

interface SimulationStoreState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot: any
  isRunning: boolean
  speed: 1 | 2 | 4
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSnapshot(s: any): void
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
