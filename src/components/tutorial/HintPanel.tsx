import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSimulationStore } from '../../store/simulationStore'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { getScenariosForTech } from '../../technologies/registry'
import { Button } from '../shared/Button'

export function HintPanel() {
  const { currentScenarioIndex, activeTechnology, useHint } = useGameStore()
  const { isHintPanelOpen, setHintPanelOpen } = useUIStore()
  const snapshot = useSimulationStore(s => s.snapshot)
  const [revealedHints, setRevealedHints] = useState<Set<number>>(new Set())

  const scenario = getScenariosForTech(activeTechnology)[currentScenarioIndex]
  if (!scenario) return null

  const hints = scenario.briefing.hints
  const currentHealth = snapshot?.systemHealthScore ?? 100

  const triggerableHints = hints.filter((h: any) => {
    if (revealedHints.has(h.order)) return true
    const healthOk = h.triggerOnHealthBelow == null || currentHealth < h.triggerOnHealthBelow
    const tickOk = h.triggerAfterTick == null || (snapshot?.tickNumber ?? 0) >= h.triggerAfterTick
    return healthOk && tickOk
  })

  const unrevealedTriggerableCount = triggerableHints.filter((h: any) => !revealedHints.has(h.order)).length

  return (
    <>
      {/* Toggle button */}
      <button
        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1 px-2 py-3 rounded-r text-xs font-medium"
        style={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderLeft: 'none', color: unrevealedTriggerableCount > 0 ? '#f59e0b' : '#64748b' }}
        onClick={() => setHintPanelOpen(!isHintPanelOpen)}
      >
        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          {unrevealedTriggerableCount > 0 ? `${unrevealedTriggerableCount} HINT${unrevealedTriggerableCount > 1 ? 'S' : ''}` : 'HINTS'}
        </span>
      </button>

      <AnimatePresence>
        {isHintPanelOpen && (
          <motion.div
            className="absolute left-0 top-0 bottom-0 z-10 w-72 overflow-y-auto flex flex-col"
            style={{ backgroundColor: '#1e293b', borderRight: '1px solid #475569' }}
            initial={{ x: -290 }}
            animate={{ x: 0 }}
            exit={{ x: -290 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="flex justify-between items-center px-3 py-2 border-b border-slate-700">
              <span className="text-xs font-semibold text-slate-300">Mission Briefing</span>
              <button onClick={() => setHintPanelOpen(false)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
            </div>

            {/* Scenario story + symptom */}
            <div className="px-3 py-2 border-b border-slate-700 bg-slate-900/40">
              <p className="text-xs text-slate-300 leading-relaxed mb-2">{scenario.briefing.story}</p>
              <div className="flex items-start gap-1.5">
                <span className="text-amber-400 text-xs shrink-0 mt-px">⚠</span>
                <p className="text-xs text-amber-300 leading-relaxed">{scenario.briefing.symptom}</p>
              </div>
            </div>

            {/* Goal */}
            <div className="px-3 py-2 border-b border-slate-700">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Your Goal</div>
              <p className="text-xs text-green-400 leading-relaxed">{scenario.briefing.goal}</p>
            </div>

            {/* Hints */}
            <div className="p-3 flex flex-col gap-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hints</div>
              {hints.map((hint: any) => {
                const isTriggerable = triggerableHints.some((h: any) => h.order === hint.order)
                const isRevealed = revealedHints.has(hint.order)
                const healthThreshold = hint.triggerOnHealthBelow
                // Progress toward unlocking: 0 = just started, 1 = threshold reached
                const unlockProgress = healthThreshold != null
                  ? Math.min(1, (100 - currentHealth) / (100 - healthThreshold))
                  : 1

                return (
                  <div key={hint.order} className="rounded p-2" style={{ backgroundColor: '#0f172a', border: `1px solid ${isRevealed ? '#1e40af' : isTriggerable ? '#92400e' : '#1e293b'}` }}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-slate-500">Hint {hint.order}</span>
                      <span className="text-xs text-blue-400 capitalize">{hint.relatedConcept.replace(/-/g, ' ')}</span>
                    </div>
                    {isRevealed ? (
                      <p className="text-xs text-slate-200 leading-relaxed">{hint.text}</p>
                    ) : isTriggerable ? (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs text-amber-300 italic">New hint available!</p>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          onClick={() => {
                            setRevealedHints(prev => new Set([...prev, hint.order]))
                            useHint()
                          }}
                        >
                          Reveal Hint (−50 pts)
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-slate-600 italic mb-2">
                          {healthThreshold != null
                            ? `Unlocks when system health drops below ${healthThreshold}%`
                            : hint.triggerAfterTick != null
                            ? `Unlocks after tick ${hint.triggerAfterTick}`
                            : 'Not yet available'}
                        </p>
                        {healthThreshold != null && (
                          <div>
                            <div className="flex justify-between text-xs text-slate-600 mb-1">
                              <span>Health now: {Math.round(currentHealth)}%</span>
                              <span>Triggers at: {healthThreshold}%</span>
                            </div>
                            <div className="w-full h-1 rounded bg-slate-700">
                              <div
                                className="h-1 rounded transition-all duration-500"
                                style={{ width: `${unlockProgress * 100}%`, backgroundColor: unlockProgress > 0.7 ? '#f59e0b' : '#475569' }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
