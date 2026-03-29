import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import { TECH_DEFINITIONS } from '../../technologies/types'
import type { TechKey } from '../../technologies/types'

const TECH_ORDER: TechKey[] = ['kafka', 'redis', 'elasticsearch', 'flink', 'rabbitmq']

export function TechnologyLobby() {
  const { setActiveTechnology, techProgress } = useGameStore()

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: '#0f172a' }}
    >
      {/* Header */}
      <div className="text-center pt-12 pb-6">
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold text-slate-100 tracking-tight">
            Distributed Ops Game
          </h1>
          <p className="text-slate-400 mt-2 text-base">
            Fix real distributed systems. No cluster required.
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex justify-center gap-6 mt-3 text-xs text-slate-600"
        >
          <span>5 Technologies</span>
          <span>•</span>
          <span>150 Scenarios</span>
          <span>•</span>
          <span>Beginner → Master</span>
        </motion.div>
      </div>

      {/* Technology cards */}
      <div className="flex-1 flex items-center justify-center px-8 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 max-w-6xl w-full">
          {TECH_ORDER.map((key, i) => {
            const def = TECH_DEFINITIONS[key]
            const tp = techProgress[key]
            const completed = Object.values(tp.scenarioProgress).filter(p => p.completedAt).length
            const totalStars = Object.values(tp.scenarioProgress).reduce((acc, p) => acc + (p.stars ?? 0), 0)
            const maxStars = def.scenarioCount * 3

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <button
                  onClick={() => setActiveTechnology(key)}
                  className="w-full text-left rounded-xl p-5 transition-all duration-200 group"
                  style={{
                    backgroundColor: def.bgColor,
                    border: `1px solid ${def.color}33`,
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = def.color + '88'
                    ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = def.color + '33'
                    ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                  }}
                >
                  {/* Icon + name */}
                  <div className="text-3xl mb-3">{def.icon}</div>
                  <div className="font-bold text-slate-100 text-sm mb-0.5">{def.name}</div>
                  <div className="text-xs text-slate-400 mb-3 leading-tight">{def.tagline}</div>

                  {/* Scenario count + progress */}
                  <div className="text-xs text-slate-500 mb-1">
                    {completed}/{def.scenarioCount} scenarios
                  </div>

                  {/* Progress bar */}
                  <div
                    className="w-full h-1 rounded-full mb-3 overflow-hidden"
                    style={{ backgroundColor: '#1e293b' }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round((completed / def.scenarioCount) * 100)}%`,
                        backgroundColor: def.color,
                      }}
                    />
                  </div>

                  {/* Stars */}
                  <div className="flex gap-0.5">
                    {Array.from({ length: 3 }).map((_, si) => {
                      const threshold = (maxStars / 3) * (si + 1)
                      const lit = totalStars >= threshold
                      return (
                        <span
                          key={si}
                          className="text-sm"
                          style={{ color: lit ? '#facc15' : '#1e293b' }}
                        >
                          ★
                        </span>
                      )
                    })}
                  </div>

                  {/* Top concepts */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {def.concepts.slice(0, 3).map(c => (
                      <span
                        key={c}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: def.color + '22', color: def.color }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </button>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
