import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { useSimulationStore } from '../../store/simulationStore'
import { getScenariosForTech } from '../../technologies/registry'
import { Button } from '../shared/Button'

export function VictoryScreen() {
  const { currentScenarioIndex, activeTechnology, scenarioProgress, returnToMenu, startScenario, unlockedScenarios } = useGameStore()
  const snapshot = useSimulationStore(s => s.snapshot)
  const scenarios = getScenariosForTech(activeTechnology)
  const scenario = scenarios[currentScenarioIndex]
  const progress = scenarioProgress[currentScenarioIndex]

  if (!scenario || !progress) return null

  const score = progress.bestScore ?? 0
  const stars = progress.stars
  const nextIndex = currentScenarioIndex + 1
  const hasNext = nextIndex < scenarios.length && unlockedScenarios.includes(nextIndex)

  return (
    <div className="flex items-center justify-center h-full p-8" style={{ backgroundColor: '#0f172a' }}>
      <motion.div
        className="max-w-lg w-full rounded-xl p-8 text-center"
        style={{ backgroundColor: '#1e293b', border: '1px solid #22c55e44' }}
        initial={{ opacity: 0, scale: 0.85, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="text-4xl mb-2">✓</div>
          <h2 className="text-2xl font-bold text-green-400 mb-1">Simulation Resolved</h2>
          <p className="text-slate-400 text-sm">{scenario.title}</p>
        </motion.div>

        {/* Stars */}
        <motion.div
          className="flex justify-center gap-3 my-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {[1, 2, 3].map((s, i) => (
            <motion.span
              key={s}
              className="text-5xl"
              style={{ color: stars >= s ? '#facc15' : '#334155' }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4 + i * 0.15, type: 'spring', stiffness: 300 }}
            >
              ★
            </motion.span>
          ))}
        </motion.div>

        {/* Score */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <div className="text-3xl font-bold font-mono text-slate-100 mb-1">{score.toLocaleString()}</div>
          <div className="text-xs text-slate-500">points</div>
        </motion.div>

        {/* Stats */}
        <motion.div
          className="grid grid-cols-3 gap-3 mb-6 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <div className="rounded p-2" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
            <div className="text-lg font-bold text-slate-100">{progress.hintsUsed}</div>
            <div className="text-xs text-slate-500">Hints Used</div>
          </div>
          <div className="rounded p-2" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
            <div className="text-lg font-bold text-slate-100">{snapshot?.systemHealthScore ?? '—'}%</div>
            <div className="text-xs text-slate-500">Final Health</div>
          </div>
          <div className="rounded p-2" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
            <div className="text-lg font-bold text-slate-100">{progress.attemptCount}</div>
            <div className="text-xs text-slate-500">Attempts</div>
          </div>
        </motion.div>

        {/* Concepts learned */}
        <motion.div
          className="mb-6 text-left"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Concepts Learned</div>
          <div className="flex flex-wrap gap-1">
            {scenario.coverConcepts.map((c: string) => (
              <span key={c} className="text-xs px-2 py-0.5 rounded bg-green-900/40 text-green-400 border border-green-800/50">
                {c.replace(/-/g, ' ')}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          className="flex gap-2 justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
        >
          <Button variant="ghost" onClick={returnToMenu}>← Menu</Button>
          <Button variant="secondary" onClick={() => startScenario(currentScenarioIndex)}>Retry</Button>
          {hasNext && (
            <Button variant="primary" size="lg" onClick={() => startScenario(nextIndex)}>
              Next Scenario →
            </Button>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}
