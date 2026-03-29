import { useGameStore } from '../../store/gameStore'
import { useSimulationStore } from '../../store/simulationStore'
import { DIFFICULTY_COLORS, DIFFICULTY_LABELS } from '../../scenarios/index'
import { getScenariosForTech } from '../../technologies/registry'
import { COLORS } from '../../constants/colors'
import { formatSimTime } from '../../utils/formatters'
import { GAME } from '../../constants/game'
import type { SimulationEngine } from '../../engine/SimulationEngine'

interface TopBarProps {
  engine: SimulationEngine | null
}

export function TopBar({ engine }: TopBarProps) {
  const { currentScenarioIndex, activeTechnology, phase, pauseGame, resumeGame, returnToMenu, simulationSpeed, setSimulationSpeed } = useGameStore()
  const snapshot = useSimulationStore(s => s.snapshot)
  const scenario = getScenariosForTech(activeTechnology)[currentScenarioIndex]

  const health = snapshot?.systemHealthScore ?? 100
  const healthColor = health > 70 ? COLORS.health.green : health > 40 ? COLORS.health.yellow : health > 20 ? COLORS.health.orange : COLORS.health.red
  const tick = snapshot?.tickNumber ?? 0

  return (
    <div className="flex items-center justify-between px-4 h-12 border-b border-slate-700 shrink-0" style={{ backgroundColor: '#0f172a' }}>
      {/* Left: scenario info */}
      <div className="flex items-center gap-3">
        <button onClick={returnToMenu} className="text-slate-500 hover:text-slate-300 text-xs">← Menu</button>
        {scenario && (
          <>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={{ backgroundColor: DIFFICULTY_COLORS[scenario.difficulty] + '22', color: DIFFICULTY_COLORS[scenario.difficulty] }}
            >
              {DIFFICULTY_LABELS[scenario.difficulty]}
            </span>
            <span className="text-sm font-semibold text-slate-200">{scenario.title}</span>
          </>
        )}
      </div>

      {/* Center: health + timer */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Health</span>
          <div className="w-24 h-2 rounded-full bg-slate-800">
            <div className="h-2 rounded-full transition-all duration-300" style={{ width: `${health}%`, backgroundColor: healthColor }} />
          </div>
          <span className="text-xs font-mono" style={{ color: healthColor }}>{health}%</span>
        </div>
        <div className="text-xs font-mono text-slate-400">{formatSimTime(tick, GAME.TICK_RATE_MS)}</div>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        {/* Speed selector */}
        <div className="flex gap-1">
          {([1, 2, 4] as const).map(s => (
            <button
              key={s}
              onClick={() => { setSimulationSpeed(s); engine?.setSpeed(s) }}
              className={`text-xs px-2 py-1 rounded ${simulationSpeed === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Pause/resume */}
        <button
          onClick={() => { phase === 'playing' ? (pauseGame(), engine?.stop()) : (resumeGame(), engine?.start()) }}
          className="text-xs px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
        >
          {phase === 'playing' ? '⏸ Pause' : '▶ Resume'}
        </button>
      </div>
    </div>
  )
}
