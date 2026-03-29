import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { DIFFICULTY_COLORS, DIFFICULTY_LABELS } from '../../scenarios/index'
import { getScenariosForTech } from '../../technologies/registry'
import { Button } from '../shared/Button'

interface BriefingScreenProps {
  onStart: () => void
}

export function BriefingScreen({ onStart }: BriefingScreenProps) {
  const { currentScenarioIndex, activeTechnology, returnToMenu } = useGameStore()
  const scenario = getScenariosForTech(activeTechnology)[currentScenarioIndex]
  if (!scenario) return null

  const diffColor = DIFFICULTY_COLORS[scenario.difficulty]

  return (
    <div className="flex items-center justify-center h-full p-8" style={{ backgroundColor: '#0f172a' }}>
      <motion.div
        className="max-w-xl w-full rounded-xl p-6"
        style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: diffColor + '22', color: diffColor }}>
              {DIFFICULTY_LABELS[scenario.difficulty]}
            </span>
            <h2 className="text-xl font-bold text-slate-100 mt-2">{scenario.title}</h2>
            <p className="text-slate-400 text-sm">{scenario.subtitle}</p>
          </div>
          <span className="text-xs text-slate-500">~{scenario.estimatedMinutes}min</span>
        </div>

        <div className="space-y-3 mb-6">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Situation</div>
            <p className="text-sm text-slate-300 leading-relaxed">{scenario.briefing.story}</p>
          </div>
          <div className="rounded p-3" style={{ backgroundColor: '#7f1d1d22', border: '1px solid #ef444444' }}>
            <div className="text-xs font-semibold text-red-400 mb-1">Problem</div>
            <p className="text-sm text-slate-300">{scenario.briefing.symptom}</p>
          </div>
          <div className="rounded p-3" style={{ backgroundColor: '#14532d22', border: '1px solid #22c55e44' }}>
            <div className="text-xs font-semibold text-green-400 mb-1">Goal</div>
            <p className="text-sm text-slate-300">{scenario.briefing.goal}</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Concepts Covered</div>
          <div className="flex flex-wrap gap-1">
            {scenario.coverConcepts.map((c: string) => (
              <span key={c} className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                {c.replace(/-/g, ' ')}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={returnToMenu}>← Back</Button>
          <Button variant="primary" size="lg" onClick={onStart}>Start Simulation →</Button>
        </div>
      </motion.div>
    </div>
  )
}
