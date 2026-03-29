import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { SCENARIOS, DIFFICULTY_COLORS, DIFFICULTY_LABELS } from '../../scenarios/index'
import { REDIS_SCENARIOS } from '../../technologies/redis/scenarios/index'
import { ES_SCENARIOS } from '../../technologies/elasticsearch/scenarios/index'
import { FLINK_SCENARIOS } from '../../technologies/flink/scenarios/index'
import { RABBITMQ_SCENARIOS } from '../../technologies/rabbitmq/scenarios/index'
import { TECH_DEFINITIONS } from '../../technologies/types'
import type { TechKey } from '../../technologies/types'

const TECH_SCENARIOS: Record<TechKey, any[]> = {
  kafka: SCENARIOS,
  redis: REDIS_SCENARIOS,
  elasticsearch: ES_SCENARIOS,
  flink: FLINK_SCENARIOS,
  rabbitmq: RABBITMQ_SCENARIOS,
}

export function MainMenu() {
  const { startScenario, unlockedScenarios, scenarioProgress, returnToLobby, activeTechnology } = useGameStore()
  const def = TECH_DEFINITIONS[activeTechnology]
  const scenarios = TECH_SCENARIOS[activeTechnology]

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: '#0f172a' }}>
      {/* Header */}
      <div className="text-center py-6 border-b border-slate-800">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          {/* Back to lobby */}
          <button
            onClick={returnToLobby}
            className="absolute left-6 top-5 text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            ← All Technologies
          </button>

          <div className="text-2xl mb-1">{def.icon}</div>
          <h1 className="text-2xl font-bold text-slate-100">{def.name}</h1>
          <p className="text-slate-400 mt-1 text-sm">{def.tagline}</p>
        </motion.div>
        <div className="flex justify-center gap-6 mt-2 text-xs text-slate-600">
          <span>{def.scenarioCount} Scenarios</span>
          <span>•</span>
          <span>Beginner → Master</span>
          <span>•</span>
          <span>Real {def.name} Concepts</span>
        </div>
      </div>

      {/* Scenario grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {scenarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-4">{def.icon}</div>
            <div className="text-slate-400 text-lg font-medium mb-2">{def.name} scenarios coming soon</div>
            <div className="text-slate-600 text-sm max-w-sm">
              30 scenarios covering {def.concepts.join(', ')} are being built.
              <br />Check back in the next update!
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {scenarios.map((scenario: any, idx: number) => {
              const isLocked = !unlockedScenarios.includes(idx)
              const progress = scenarioProgress[idx]
              const diffColor = DIFFICULTY_COLORS[scenario.difficulty] ?? def.color

              return (
                <motion.div
                  key={scenario.id ?? idx}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.02 }}
                >
                  <button
                    disabled={isLocked}
                    onClick={() => startScenario(idx)}
                    className="w-full text-left rounded-lg p-3 transition-all duration-200"
                    style={{
                      backgroundColor: isLocked ? '#0f172a' : '#1e293b',
                      border: `1px solid ${isLocked ? '#1e293b' : progress?.completedAt ? diffColor + '66' : '#334155'}`,
                      opacity: isLocked ? 0.4 : 1,
                      cursor: isLocked ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={e => {
                      if (!isLocked) (e.currentTarget as HTMLElement).style.borderColor = diffColor + '99'
                    }}
                    onMouseLeave={e => {
                      if (!isLocked) (e.currentTarget as HTMLElement).style.borderColor = progress?.completedAt ? diffColor + '66' : '#334155'
                    }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono text-slate-500">#{String(idx + 1).padStart(2, '0')}</span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: diffColor + '22', color: diffColor }}
                      >
                        {DIFFICULTY_LABELS[scenario.difficulty] ?? scenario.difficulty}
                      </span>
                    </div>

                    <div className="font-medium text-sm text-slate-200 mb-1">{scenario.title}</div>
                    <div className="text-xs text-slate-500 mb-2">{scenario.estimatedMinutes}min</div>

                    {/* Stars */}
                    <div className="flex gap-0.5">
                      {[1, 2, 3].map(s => (
                        <span key={s} className="text-base" style={{ color: (progress?.stars ?? 0) >= s ? '#facc15' : '#334155' }}>★</span>
                      ))}
                    </div>

                    {isLocked && (
                      <div className="text-xs text-slate-600 mt-1">Complete #{idx} to unlock</div>
                    )}
                  </button>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
