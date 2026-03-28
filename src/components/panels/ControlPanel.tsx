import { useGameStore } from '../../store/gameStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useUIStore } from '../../store/uiStore'
import { SCENARIOS } from '../../scenarios/index'
import type { SimulationEngine } from '../../engine/SimulationEngine'
import { TopicConfigPanel } from './TopicConfigPanel'
import { ProducerConfigPanel } from './ProducerConfigPanel'
import { ConsumerConfigPanel } from './ConsumerConfigPanel'
import { BrokerConfigPanel } from './BrokerConfigPanel'

interface ControlPanelProps {
  engine: SimulationEngine
}

const TAB_LABELS: Record<string, string> = {
  topic: 'Topic',
  producer: 'Producer',
  consumer: 'Consumer',
  broker: 'Broker',
}

export function ControlPanel({ engine }: ControlPanelProps) {
  const { currentScenarioIndex } = useGameStore()
  const snapshot = useSimulationStore(s => s.snapshot)
  const { activeControlTab, setActiveControlTab } = useUIStore()
  const scenario = SCENARIOS[currentScenarioIndex]

  const tabs = ['topic', 'producer', 'consumer', 'broker'].filter(tab => {
    if (!scenario) return true
    const actions = scenario.availableActions
    if (tab === 'topic') return actions.some(a => ['add-partitions','change-replication','set-retention-ms','set-retention-bytes','set-cleanup-policy','set-min-isr','set-message-size'].includes(a))
    if (tab === 'producer') return actions.some(a => ['set-producer-acks','enable-idempotence','enable-transactions','set-producer-key','set-linger-ms','set-batch-size','set-compression','set-fetch-config','set-schema'].includes(a))
    if (tab === 'consumer') return actions.some(a => ['add-consumer','remove-consumer','set-max-poll-records','set-offset-reset','enable-manual-commit','set-isolation-level','set-session-timeout','set-poll-interval','set-heartbeat','add-dlq','configure-retry','reset-consumer-group-offset','set-schema'].includes(a))
    if (tab === 'broker') return actions.some(a => ['toggle-broker'].includes(a))
    return true
  })

  if (tabs.length === 0) return null

  const activeTab = tabs.includes(activeControlTab) ? activeControlTab : tabs[0]

  return (
    <div className="w-full flex flex-col" style={{ backgroundColor: '#1e293b' }}>
      {/* Scenario goal */}
      {scenario && (
        <div className="px-3 py-2 border-b border-slate-700">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Goal</div>
          <div className="text-xs text-slate-300 leading-snug">{scenario.briefing.goal}</div>
          <div className="mt-1 text-xs text-amber-400 italic">{scenario.briefing.symptom}</div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveControlTab(tab)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {TAB_LABELS[tab] ?? tab}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'topic' && snapshot && <TopicConfigPanel engine={engine} snapshot={snapshot} scenario={scenario} />}
        {activeTab === 'producer' && snapshot && <ProducerConfigPanel engine={engine} snapshot={snapshot} scenario={scenario} />}
        {activeTab === 'consumer' && snapshot && <ConsumerConfigPanel engine={engine} snapshot={snapshot} scenario={scenario} />}
        {activeTab === 'broker' && snapshot && <BrokerConfigPanel engine={engine} snapshot={snapshot} />}
      </div>
    </div>
  )
}
