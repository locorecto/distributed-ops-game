import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { getScenariosForTech } from '../../technologies/registry'
import { Button } from '../shared/Button'

export function FailureScreen() {
  const { currentScenarioIndex, activeTechnology, scenarioProgress, returnToMenu, startScenario } = useGameStore()
  const scenario = getScenariosForTech(activeTechnology)[currentScenarioIndex]
  const progress = scenarioProgress[currentScenarioIndex]

  if (!scenario) return null

  const attempts = progress?.attemptCount ?? 1

  return (
    <div className="flex items-center justify-center h-full p-8" style={{ backgroundColor: '#0f172a' }}>
      <motion.div
        className="max-w-lg w-full rounded-xl p-8 text-center"
        style={{ backgroundColor: '#1e293b', border: '1px solid #ef444444' }}
        initial={{ opacity: 0, scale: 0.85, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        {/* Header */}
        <div className="text-4xl mb-2">✕</div>
        <h2 className="text-2xl font-bold text-red-400 mb-1">System Failure</h2>
        <p className="text-slate-400 text-sm mb-6">{scenario.title}</p>

        {/* Symptom recap */}
        <div className="rounded p-4 mb-6 text-left" style={{ backgroundColor: '#7f1d1d22', border: '1px solid #ef444444' }}>
          <div className="text-xs font-semibold text-red-400 mb-1">What went wrong</div>
          <p className="text-sm text-slate-300">{scenario.briefing.symptom}</p>
        </div>

        {/* Goal reminder */}
        <div className="rounded p-4 mb-6 text-left" style={{ backgroundColor: '#14532d22', border: '1px solid #22c55e44' }}>
          <div className="text-xs font-semibold text-green-400 mb-1">Your goal</div>
          <p className="text-sm text-slate-300">{scenario.briefing.goal}</p>
        </div>

        {attempts > 1 && (
          <p className="text-xs text-slate-500 mb-4">Attempt {attempts} — keep going!</p>
        )}

        <div className="flex gap-2 justify-center">
          <Button variant="ghost" onClick={returnToMenu}>← Menu</Button>
          <Button variant="primary" size="lg" onClick={() => startScenario(currentScenarioIndex)}>
            Try Again →
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
