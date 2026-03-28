import { useEffect, useRef, useState } from 'react'
import { SimulationEngine } from '../../engine/SimulationEngine'
import { useGameStore } from '../../store/gameStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useMetricsStore } from '../../store/metricsStore'
import { useUIStore } from '../../store/uiStore'
import { useSimulation } from '../../hooks/useSimulation'
import { useVictory } from '../../hooks/useVictory'
import { useHints } from '../../hooks/useHints'
import { SCENARIOS } from '../../scenarios/index'
import { TopBar } from '../layout/TopBar'
import { SimulationCanvas } from '../canvas/SimulationCanvas'
import { ControlPanel } from '../panels/ControlPanel'
import { MetricsPanel } from '../metrics/MetricsPanel'
import { HintPanel } from '../tutorial/HintPanel'

export function GameScreen() {
  const { currentScenarioIndex, phase } = useGameStore()
  const clearSnapshot = useSimulationStore(s => s.clear)
  const clearMetrics = useMetricsStore(s => s.clearHistory)
  const clearSelection = useUIStore(s => s.clearSelection)
  const setHintPanelOpen = useUIStore(s => s.setHintPanelOpen)
  const engineRef = useRef<SimulationEngine | null>(null)
  // State copy so useSimulation re-runs its effect when engine changes
  const [engine, setEngine] = useState<SimulationEngine | null>(null)

  // Create/reset engine when scenario changes
  useEffect(() => {
    const scenario = SCENARIOS[currentScenarioIndex]
    if (!scenario) return

    // Tear down previous engine
    engineRef.current?.stop()
    clearSnapshot()
    clearMetrics()
    clearSelection()
    setHintPanelOpen(false)

    const newEngine = new SimulationEngine()
    newEngine.loadScenario(scenario)
    engineRef.current = newEngine
    setEngine(newEngine)

    // Auto-start when entering playing phase
    if (phase === 'playing') {
      newEngine.start()
    }

    return () => {
      newEngine.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScenarioIndex])

  // Handle phase transitions (pause/resume)
  useEffect(() => {
    const eng = engineRef.current
    if (!eng) return

    if (phase === 'playing') {
      eng.start()
    } else if (phase === 'paused') {
      eng.stop()
    }
  }, [phase])

  useSimulation(engine)
  useVictory()
  useHints()

  if (!engine) return null

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: '#0f172a' }}>
      <TopBar engine={engine} />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Hint panel slides in from left edge */}
        <HintPanel />

        {/* Main canvas area */}
        <div className="flex-1 overflow-hidden relative">
          <SimulationCanvas />
        </div>

        {/* Right control panel */}
        <div
          className="w-72 shrink-0 overflow-y-auto border-l border-slate-700"
          style={{ backgroundColor: '#1e293b' }}
        >
          <ControlPanel engine={engine} />
        </div>
      </div>

      {/* Bottom metrics strip */}
      <MetricsPanel />
    </div>
  )
}
