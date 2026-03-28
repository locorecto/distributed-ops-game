import { useEffect, useRef } from 'react'
import { useSimulationStore } from '../store/simulationStore'
import { useGameStore, computeScore } from '../store/gameStore'
import { SCENARIOS } from '../scenarios/index'
import { GAME } from '../constants/game'

export function useVictory(): void {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const { phase, currentScenarioIndex, hintsUsedThisRun, recordVictory } = useGameStore()
  const consecutiveRef = useRef(0)
  const startTickRef = useRef<number | null>(null)

  // Reset refs when scenario changes
  useEffect(() => {
    consecutiveRef.current = 0
    startTickRef.current = null
  }, [currentScenarioIndex])

  useEffect(() => {
    if (phase !== 'playing' || !snapshot) {
      consecutiveRef.current = 0
      return
    }

    const scenario = SCENARIOS[currentScenarioIndex]
    if (!scenario) return

    if (startTickRef.current === null) {
      startTickRef.current = snapshot.tickNumber
    }

    // Don't check victory until after the first failure injection has had time to fire,
    // so we don't win on the trivially-healthy initial state before any problem appears.
    const firstFailureTick = scenario.failureScript.length > 0
      ? Math.min(...scenario.failureScript.map(f => f.atTick))
      : 0
    const gracePeriod = firstFailureTick + 20  // 2 extra seconds buffer

    if (snapshot.tickNumber < gracePeriod) return

    const allRequired = scenario.victoryConditions
      .filter((vc) => vc.required)
      .every((vc) => vc.check(snapshot))

    if (allRequired) {
      consecutiveRef.current++
    } else {
      consecutiveRef.current = 0
    }

    if (consecutiveRef.current >= GAME.VICTORY_SUSTAIN_TICKS) {
      const secondsTaken = ((snapshot.tickNumber - (startTickRef.current ?? 0)) * GAME.TICK_RATE_MS) / 1000
      const { score, stars } = computeScore(
        secondsTaken,
        hintsUsedThisRun,
        snapshot.systemHealthScore,
        snapshot.metrics.duplicateCount,
      )
      const conceptsLearned = scenario.coverConcepts as string[]
      recordVictory(score, stars, conceptsLearned)
      consecutiveRef.current = 0
    }
  }, [snapshot, phase, currentScenarioIndex, hintsUsedThisRun, recordVictory])
}
