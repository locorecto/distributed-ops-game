import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type GamePhase =
  | 'menu'
  | 'briefing'
  | 'playing'
  | 'paused'
  | 'victory'
  | 'failed'
  | 'glossary'

export interface ScenarioProgress {
  bestScore: number | null
  completedAt: string | null
  hintsUsed: number
  attemptCount: number
  conceptsLearned: string[]
  stars: 0 | 1 | 2 | 3
}

interface GameState {
  phase: GamePhase
  currentScenarioIndex: number
  unlockedScenarios: number[]
  scenarioProgress: Record<number, ScenarioProgress>
  totalScore: number
  hintsUsedThisRun: number
  simulationSpeed: 1 | 2 | 4
  soundEnabled: boolean

  setPhase(phase: GamePhase): void
  startScenario(index: number): void
  pauseGame(): void
  resumeGame(): void
  useHint(): void
  recordVictory(score: number, stars: 0 | 1 | 2 | 3, conceptsLearned: string[]): void
  recordFailure(): void
  returnToMenu(): void
  setSimulationSpeed(speed: 1 | 2 | 4): void
  toggleSound(): void
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      phase: 'menu',
      currentScenarioIndex: 0,
      unlockedScenarios: [0],
      scenarioProgress: {},
      totalScore: 0,
      hintsUsedThisRun: 0,
      simulationSpeed: 1,
      soundEnabled: true,

      setPhase: (phase) => set({ phase }),

      startScenario: (index) => {
        set({ phase: 'briefing', currentScenarioIndex: index, hintsUsedThisRun: 0 })
      },

      pauseGame: () => set({ phase: 'paused' }),
      resumeGame: () => set({ phase: 'playing' }),

      useHint: () => set(s => ({ hintsUsedThisRun: s.hintsUsedThisRun + 1 })),

      recordVictory: (score, stars, conceptsLearned) => {
        const { currentScenarioIndex, scenarioProgress, totalScore, hintsUsedThisRun } = get()
        const prev = scenarioProgress[currentScenarioIndex]
        const isBetter = !prev || score > (prev.bestScore ?? 0)
        set({
          phase: 'victory',
          totalScore: totalScore + score,
          scenarioProgress: {
            ...scenarioProgress,
            [currentScenarioIndex]: {
              bestScore: isBetter ? score : prev.bestScore,
              completedAt: new Date().toISOString(),
              hintsUsed: hintsUsedThisRun,
              attemptCount: (prev?.attemptCount ?? 0) + 1,
              conceptsLearned: Array.from(new Set([...(prev?.conceptsLearned ?? []), ...conceptsLearned])),
              stars: isBetter ? stars : (prev?.stars ?? 0),
            },
          },
          unlockedScenarios: Array.from(
            new Set([...get().unlockedScenarios, currentScenarioIndex + 1])
          ),
        })
      },

      recordFailure: () => {
        const { currentScenarioIndex, scenarioProgress } = get()
        const prev = scenarioProgress[currentScenarioIndex]
        set({
          phase: 'failed',
          scenarioProgress: {
            ...scenarioProgress,
            [currentScenarioIndex]: {
              ...(prev ?? { bestScore: null, completedAt: null, hintsUsed: 0, conceptsLearned: [], stars: 0 }),
              attemptCount: (prev?.attemptCount ?? 0) + 1,
            },
          },
        })
      },

      returnToMenu: () => set({ phase: 'menu' }),

      setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),

      toggleSound: () => set(s => ({ soundEnabled: !s.soundEnabled })),
    }),
    {
      name: 'kafka-ops-game',
      partialize: (state) => ({
        unlockedScenarios: state.unlockedScenarios,
        scenarioProgress: state.scenarioProgress,
        totalScore: state.totalScore,
        soundEnabled: state.soundEnabled,
      }),
    },
  ),
)

export function computeScore(
  secondsTaken: number,
  hintsUsed: number,
  finalHealthScore: number,
  duplicateMessages: number,
): { score: number; stars: 0 | 1 | 2 | 3 } {
  const base = 1000
  const timePenalty = Math.floor(secondsTaken * 5)
  const hintPenalty = hintsUsed * 50
  const healthBonus = Math.floor(finalHealthScore * 2)
  const dupPenalty = duplicateMessages * 10
  const score = Math.max(0, base - timePenalty - hintPenalty + healthBonus - dupPenalty)
  const stars = score >= 800 ? 3 : score >= 500 ? 2 : score >= 1 ? 1 : 0
  return { score, stars: stars as 0 | 1 | 2 | 3 }
}
