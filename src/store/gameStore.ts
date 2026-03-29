import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TechKey } from '../technologies/types'

export type GamePhase =
  | 'lobby'
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

export interface TechProgressState {
  unlockedScenarios: number[]
  scenarioProgress: Record<number, ScenarioProgress>
  totalScore: number
}

function defaultTechProgress(): TechProgressState {
  return { unlockedScenarios: [0], scenarioProgress: {}, totalScore: 0 }
}

interface GameState {
  phase: GamePhase
  activeTechnology: TechKey
  currentScenarioIndex: number
  techProgress: Record<TechKey, TechProgressState>
  hintsUsedThisRun: number
  simulationSpeed: 1 | 2 | 4
  soundEnabled: boolean

  // derived helpers (read-only shortcuts for active tech)
  unlockedScenarios: number[]
  scenarioProgress: Record<number, ScenarioProgress>
  totalScore: number

  setPhase(phase: GamePhase): void
  setActiveTechnology(tech: TechKey): void
  startScenario(index: number): void
  pauseGame(): void
  resumeGame(): void
  useHint(): void
  recordVictory(score: number, stars: 0 | 1 | 2 | 3, conceptsLearned: string[]): void
  recordFailure(): void
  returnToMenu(): void
  returnToLobby(): void
  setSimulationSpeed(speed: 1 | 2 | 4): void
  toggleSound(): void
}

function buildDerivedState(
  techProgress: Record<TechKey, TechProgressState>,
  activeTechnology: TechKey,
) {
  const tp = techProgress[activeTechnology] ?? defaultTechProgress()
  return {
    unlockedScenarios: tp.unlockedScenarios,
    scenarioProgress: tp.scenarioProgress,
    totalScore: tp.totalScore,
  }
}

function allTechProgress(): Record<TechKey, TechProgressState> {
  return {
    kafka: defaultTechProgress(),
    redis: defaultTechProgress(),
    elasticsearch: defaultTechProgress(),
    flink: defaultTechProgress(),
    rabbitmq: defaultTechProgress(),
  }
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      phase: 'lobby',
      activeTechnology: 'kafka',
      currentScenarioIndex: 0,
      techProgress: allTechProgress(),
      hintsUsedThisRun: 0,
      simulationSpeed: 1,
      soundEnabled: true,
      // derived
      unlockedScenarios: [0],
      scenarioProgress: {},
      totalScore: 0,

      setPhase: (phase) => set({ phase }),

      setActiveTechnology: (tech) => {
        const { techProgress } = get()
        set({
          activeTechnology: tech,
          phase: 'menu',
          ...buildDerivedState(techProgress, tech),
        })
      },

      startScenario: (index) => {
        set({ phase: 'briefing', currentScenarioIndex: index, hintsUsedThisRun: 0 })
      },

      pauseGame: () => set({ phase: 'paused' }),
      resumeGame: () => set({ phase: 'playing' }),

      useHint: () => set(s => ({ hintsUsedThisRun: s.hintsUsedThisRun + 1 })),

      recordVictory: (score, stars, conceptsLearned) => {
        const { currentScenarioIndex, techProgress, activeTechnology, hintsUsedThisRun } = get()
        const tp = techProgress[activeTechnology] ?? defaultTechProgress()
        const prev = tp.scenarioProgress[currentScenarioIndex]
        const isBetter = !prev || score > (prev.bestScore ?? 0)
        const newTp: TechProgressState = {
          ...tp,
          totalScore: tp.totalScore + score,
          scenarioProgress: {
            ...tp.scenarioProgress,
            [currentScenarioIndex]: {
              bestScore: isBetter ? score : prev.bestScore,
              completedAt: new Date().toISOString(),
              hintsUsed: hintsUsedThisRun,
              attemptCount: (prev?.attemptCount ?? 0) + 1,
              conceptsLearned: Array.from(new Set([...(prev?.conceptsLearned ?? []), ...conceptsLearned])),
              stars: isBetter ? stars : (prev?.stars ?? 0),
            },
          },
          unlockedScenarios: Array.from(new Set([...tp.unlockedScenarios, currentScenarioIndex + 1])),
        }
        const newTechProgress = { ...techProgress, [activeTechnology]: newTp }
        set({
          phase: 'victory',
          techProgress: newTechProgress,
          ...buildDerivedState(newTechProgress, activeTechnology),
        })
      },

      recordFailure: () => {
        const { currentScenarioIndex, techProgress, activeTechnology } = get()
        const tp = techProgress[activeTechnology] ?? defaultTechProgress()
        const prev = tp.scenarioProgress[currentScenarioIndex]
        const newTp: TechProgressState = {
          ...tp,
          scenarioProgress: {
            ...tp.scenarioProgress,
            [currentScenarioIndex]: {
              ...(prev ?? { bestScore: null, completedAt: null, hintsUsed: 0, conceptsLearned: [], stars: 0 }),
              attemptCount: (prev?.attemptCount ?? 0) + 1,
            },
          },
        }
        set({ phase: 'failed', techProgress: { ...techProgress, [activeTechnology]: newTp } })
      },

      returnToMenu: () => {
        const { techProgress, activeTechnology } = get()
        set({ phase: 'menu', ...buildDerivedState(techProgress, activeTechnology) })
      },

      returnToLobby: () => set({ phase: 'lobby' }),

      setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),

      toggleSound: () => set(s => ({ soundEnabled: !s.soundEnabled })),
    }),
    {
      name: 'distributed-ops-game',
      partialize: (state) => ({
        activeTechnology: state.activeTechnology,
        techProgress: state.techProgress,
        soundEnabled: state.soundEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        // rebuild derived state after rehydration
        if (state) {
          const derived = buildDerivedState(state.techProgress, state.activeTechnology)
          Object.assign(state, derived)
        }
      },
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
