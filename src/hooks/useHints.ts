import { useEffect, useRef } from 'react'
import { useSimulationStore } from '../store/simulationStore'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { SCENARIOS } from '../scenarios/index'

export function useHints(): void {
  const snapshot = useSimulationStore((s) => s.snapshot)
  const { phase, currentScenarioIndex } = useGameStore()
  const { setHintPanelOpen } = useUIStore()
  const revealedRef = useRef(new Set<number>())

  useEffect(() => {
    if (phase !== 'playing' || !snapshot) return

    const scenario = SCENARIOS[currentScenarioIndex]
    if (!scenario) return

    for (const hint of scenario.briefing.hints) {
      if (revealedRef.current.has(hint.order)) continue

      const triggerByTick = hint.triggerAfterTick != null && snapshot.tickNumber >= hint.triggerAfterTick
      const triggerByHealth = hint.triggerOnHealthBelow != null && snapshot.systemHealthScore < hint.triggerOnHealthBelow

      if (triggerByTick || triggerByHealth) {
        revealedRef.current.add(hint.order)
        setHintPanelOpen(true)
      }
    }
  }, [snapshot, phase, currentScenarioIndex, setHintPanelOpen])

  // reset on scenario change
  useEffect(() => {
    revealedRef.current.clear()
  }, [currentScenarioIndex])
}
