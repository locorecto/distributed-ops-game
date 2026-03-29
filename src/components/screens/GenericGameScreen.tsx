import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useUIStore } from '../../store/uiStore'
import { useVictory } from '../../hooks/useVictory'
import { useHints } from '../../hooks/useHints'
import { getScenariosForTech } from '../../technologies/registry'
import { TECH_DEFINITIONS } from '../../technologies/types'
import { DIFFICULTY_COLORS, DIFFICULTY_LABELS } from '../../scenarios/index'
import { TopBar } from '../layout/TopBar'
import { HintPanel } from '../tutorial/HintPanel'
import type { TechKey } from '../../technologies/types'

// ── Action label helpers ──────────────────────────────────────────────────────

function labelFromActionId(id: string): string {
  return id
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ── Generic entity extraction from any snapshot ───────────────────────────────

interface GenericEntity {
  id: string
  label: string
  status: 'healthy' | 'degraded' | 'critical' | 'offline'
  metrics: { label: string; value: string }[]
}

function extractEntities(snapshot: any, tech: TechKey): GenericEntity[] {
  if (!snapshot) return []

  if (tech === 'redis') {
    return [...(snapshot.nodes as Map<string, any>).values()].map(node => ({
      id: node.config.id,
      label: `${node.config.role ?? 'node'} · ${node.config.id}`,
      status: !node.isOnline
        ? 'offline'
        : node.usedMemoryMb / node.config.maxMemoryMb > 0.9
        ? 'critical'
        : node.hitRate < 0.5
        ? 'degraded'
        : 'healthy',
      metrics: [
        { label: 'Memory', value: `${Math.round((node.usedMemoryMb / node.config.maxMemoryMb) * 100)}%` },
        { label: 'Hit Rate', value: `${Math.round(node.hitRate * 100)}%` },
        { label: 'Ops/s', value: `${Math.round(node.opsPerSec)}` },
        { label: 'Clients', value: `${node.connectedClients}` },
      ],
    }))
  }

  if (tech === 'elasticsearch') {
    const nodeEntities: GenericEntity[] = [...(snapshot.nodes as Map<string, any>).values()].map(node => ({
      id: node.config.id,
      label: `ES Node · ${node.config.id}`,
      status: !node.isOnline
        ? 'offline'
        : node.heapUsedPct > 0.9
        ? 'critical'
        : node.heapUsedPct > 0.75
        ? 'degraded'
        : 'healthy',
      metrics: [
        { label: 'Heap', value: `${Math.round(node.heapUsedPct * 100)}%` },
        { label: 'Disk', value: `${Math.round(node.diskUsedPct * 100)}%` },
        { label: 'CPU', value: `${Math.round(node.cpuPct * 100)}%` },
        { label: 'Master', value: node.isMaster ? '✓' : '—' },
      ],
    }))
    const indexEntities: GenericEntity[] = [...(snapshot.indices as Map<string, any>).values()].map(idx => ({
      id: idx.config.name,
      label: `Index · ${idx.config.name}`,
      status: idx.health === 'red' ? 'critical' : idx.health === 'yellow' ? 'degraded' : 'healthy',
      metrics: [
        { label: 'Health', value: idx.health },
        { label: 'Unassigned', value: `${idx.unassignedShards} shards` },
        { label: 'Query', value: `${Math.round(idx.queryLatencyMs)}ms` },
        { label: 'Docs', value: `${(idx.docsCount ?? 0).toLocaleString()}` },
      ],
    }))
    return [...nodeEntities, ...indexEntities]
  }

  if (tech === 'flink') {
    const opEntities: GenericEntity[] = [...(snapshot.operators as Map<string, any>).values()].map(op => ({
      id: op.config.id,
      label: `${op.config.name} [${op.config.type}]`,
      status: op.status === 'failed' ? 'critical' : op.status === 'backpressured' ? 'degraded' : 'healthy',
      metrics: [
        { label: 'Status', value: op.status },
        { label: 'Backpressure', value: `${Math.round(op.backpressureRatio * 100)}%` },
        { label: 'In Rate', value: `${Math.round(op.inputRate)}/s` },
        { label: 'State', value: `${Math.round(op.stateSize)}MB` },
      ],
    }))
    const tmEntities: GenericEntity[] = [...(snapshot.taskManagers as Map<string, any>).values()].map(tm => ({
      id: tm.id,
      label: `TaskManager · ${tm.id}`,
      status: !tm.isOnline
        ? 'offline'
        : tm.heapUsedMb / tm.maxHeapMb > 0.9
        ? 'critical'
        : tm.heapUsedMb / tm.maxHeapMb > 0.75
        ? 'degraded'
        : 'healthy',
      metrics: [
        { label: 'Heap', value: `${Math.round((tm.heapUsedMb / tm.maxHeapMb) * 100)}%` },
        { label: 'Slots', value: `${tm.usedSlots}/${tm.slots}` },
        { label: 'Buffers', value: `${tm.networkBuffersUsed}/${tm.networkBuffersTotal}` },
      ],
    }))
    return [...opEntities, ...tmEntities]
  }

  if (tech === 'rabbitmq') {
    const nodeEntities: GenericEntity[] = [...(snapshot.nodes as Map<string, any>).values()].map(node => ({
      id: node.id,
      label: `Broker · ${node.id}`,
      status: !node.isOnline
        ? 'offline'
        : node.isMemoryAlarm || node.isDiskAlarm
        ? 'critical'
        : node.memoryUsedMb / node.maxMemoryMb > 0.7
        ? 'degraded'
        : 'healthy',
      metrics: [
        { label: 'Memory', value: `${Math.round((node.memoryUsedMb / node.maxMemoryMb) * 100)}%` },
        { label: 'Connections', value: `${node.connectionsCount}` },
        { label: 'Alarms', value: [node.isMemoryAlarm && 'MEM', node.isDiskAlarm && 'DISK'].filter(Boolean).join(' ') || 'None' },
      ],
    }))
    const queueEntities: GenericEntity[] = [...(snapshot.queues as Map<string, any>).values()].map(q => ({
      id: q.config.name,
      label: `Queue · ${q.config.name}`,
      status: q.depth > 100_000 ? 'critical' : q.depth > 10_000 ? 'degraded' : 'healthy',
      metrics: [
        { label: 'Ready', value: q.depth.toLocaleString() },
        { label: 'Unacked', value: q.unacked.toLocaleString() },
        { label: 'Publish', value: `${Math.round(q.enqueueRate)}/s` },
        { label: 'Consume', value: `${Math.round(q.dequeueRate)}/s` },
      ],
    }))
    return [...nodeEntities, ...queueEntities]
  }

  return []
}

// ── Status color helpers ──────────────────────────────────────────────────────

const STATUS_COLORS = {
  healthy: { bg: '#14532d22', border: '#22c55e44', text: '#22c55e', dot: '#22c55e' },
  degraded: { bg: '#78350f22', border: '#f59e0b44', text: '#f59e0b', dot: '#f59e0b' },
  critical: { bg: '#7f1d1d22', border: '#ef444444', text: '#ef4444', dot: '#ef4444' },
  offline: { bg: '#1e293b', border: '#33415555', text: '#64748b', dot: '#334155' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GenericGameScreen() {
  const { currentScenarioIndex, activeTechnology, phase } = useGameStore()
  const setSnapshot = useSimulationStore(s => s.setSnapshot)
  const snapshot = useSimulationStore(s => s.snapshot)
  const setHintPanelOpen = useUIStore(s => s.setHintPanelOpen)
  const engineRef = useRef<any>(null)
  const [appliedActions, setAppliedActions] = useState<Set<string>>(new Set())

  const scenario = getScenariosForTech(activeTechnology)[currentScenarioIndex]
  const def = TECH_DEFINITIONS[activeTechnology]
  const diffColor = DIFFICULTY_COLORS[scenario?.difficulty] ?? def.color

  // Create engine and load scenario
  useEffect(() => {
    if (!scenario) return

    let engine: any = null

    async function initEngine() {
      if (activeTechnology === 'redis') {
        const { RedisEngine } = await import('../../technologies/redis/engine/RedisEngine')
        engine = new RedisEngine()
      } else if (activeTechnology === 'elasticsearch') {
        const { ElasticsearchEngine } = await import('../../technologies/elasticsearch/engine/ElasticsearchEngine')
        engine = new ElasticsearchEngine()
      } else if (activeTechnology === 'flink') {
        const { FlinkEngine } = await import('../../technologies/flink/engine/FlinkEngine')
        engine = new FlinkEngine()
      } else if (activeTechnology === 'rabbitmq') {
        const { RabbitMQEngine } = await import('../../technologies/rabbitmq/engine/RabbitMQEngine')
        engine = new RabbitMQEngine()
      }

      if (!engine) return

      engineRef.current = engine
      setAppliedActions(new Set())
      setHintPanelOpen(false)

      engine.loadScenario(scenario, (snap: any) => {
        setSnapshot(snap)
      })

      if (phase === 'playing') {
        engine.start()
      }
    }

    initEngine()

    return () => {
      engineRef.current?.stop()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScenarioIndex])

  // Handle phase transitions
  useEffect(() => {
    const eng = engineRef.current
    if (!eng) return
    if (phase === 'playing') eng.start()
    else if (phase === 'paused') eng.stop()
  }, [phase])

  useVictory()
  useHints()

  if (!scenario) return null

  const entities = extractEntities(snapshot, activeTechnology)
  const health = snapshot?.systemHealthScore ?? 0
  const errorRate = snapshot?.metrics?.errorRate ?? 0
  const healthColor = health >= 70 ? '#22c55e' : health >= 40 ? '#f59e0b' : '#ef4444'

  function handleAction(actionId: string) {
    const eng = engineRef.current
    if (!eng) return
    eng.applyAction(actionId)
    setAppliedActions(prev => new Set([...prev, actionId]))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: '#0f172a' }}>
      {/* TopBar expects a Kafka SimulationEngine — pass null, TopBar handles it gracefully */}
      <TopBar engine={null as any} />

      <div className="flex flex-1 overflow-hidden relative">
        <HintPanel />

        {/* Main canvas area */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Health + metrics strip */}
          <div
            className="rounded-xl p-4 mb-4 flex items-center gap-6"
            style={{ backgroundColor: '#1e293b', border: `1px solid ${def.color}22` }}
          >
            {/* Health ring */}
            <div className="relative shrink-0" style={{ width: 72, height: 72 }}>
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="30" fill="none" stroke="#334155" strokeWidth="6" />
                <circle
                  cx="36" cy="36" r="30" fill="none"
                  stroke={healthColor}
                  strokeWidth="6"
                  strokeDasharray={`${2 * Math.PI * 30}`}
                  strokeDashoffset={`${2 * Math.PI * 30 * (1 - health / 100)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 36 36)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-bold" style={{ color: healthColor }}>{Math.round(health)}</span>
                <span className="text-xs text-slate-500">health</span>
              </div>
            </div>

            {/* Metrics */}
            <div className="flex gap-6 flex-wrap">
              <MetricBadge label="Error Rate" value={`${(errorRate * 100).toFixed(1)}%`} warn={errorRate > 0.05} />
              {snapshot?.metrics?.totalOpsPerSec != null && (
                <MetricBadge label="Ops/s" value={Math.round(snapshot.metrics.totalOpsPerSec).toLocaleString()} />
              )}
              {snapshot?.metrics?.avgLatencyMs != null && (
                <MetricBadge label="Latency" value={`${Math.round(snapshot.metrics.avgLatencyMs)}ms`} warn={snapshot.metrics.avgLatencyMs > 100} />
              )}
              {snapshot?.metrics?.recordsPerSecond != null && (
                <MetricBadge label="Records/s" value={Math.round(snapshot.metrics.recordsPerSecond).toLocaleString()} />
              )}
              {snapshot?.metrics?.totalMessagesReady != null && (
                <MetricBadge label="Msg Ready" value={snapshot.metrics.totalMessagesReady.toLocaleString()} warn={snapshot.metrics.totalMessagesReady > 10000} />
              )}
              {snapshot?.metrics?.unassignedShards != null && (
                <MetricBadge label="Unassigned Shards" value={snapshot.metrics.unassignedShards} warn={snapshot.metrics.unassignedShards > 0} />
              )}
              {snapshot?.activeFailures?.length > 0 && (
                <MetricBadge label="Active Failures" value={snapshot.activeFailures.length} warn />
              )}
            </div>

            {/* Tick */}
            {snapshot?.tickNumber != null && (
              <div className="ml-auto text-xs text-slate-600 font-mono">
                tick {snapshot.tickNumber}
              </div>
            )}
          </div>

          {/* Entity cards */}
          {entities.length > 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
              {entities.map(entity => {
                const c = STATUS_COLORS[entity.status]
                return (
                  <div
                    key={entity.id}
                    className="rounded-lg p-3"
                    style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
                      <span className="text-xs font-medium text-slate-300 truncate">{entity.label}</span>
                      <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ color: c.text, backgroundColor: c.bg }}>
                        {entity.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {entity.metrics.map(m => (
                        <div key={m.label} className="flex justify-between text-xs">
                          <span className="text-slate-500">{m.label}</span>
                          <span className="text-slate-300 font-mono">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Victory conditions */}
          {scenario.victoryConditions && snapshot && (
            <div className="rounded-lg p-3 mb-4" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Victory Conditions</div>
              <div className="space-y-1">
                {scenario.victoryConditions.map((vc: any) => {
                  const met = vc.check(snapshot)
                  return (
                    <div key={vc.id} className="flex items-center gap-2 text-xs">
                      <span style={{ color: met ? '#22c55e' : '#475569' }}>{met ? '✓' : '○'}</span>
                      <span style={{ color: met ? '#86efac' : '#94a3b8' }}>{vc.description}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right panel — available actions */}
        <div
          className="w-64 shrink-0 overflow-y-auto border-l border-slate-700 p-4"
          style={{ backgroundColor: '#1e293b' }}
        >
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Available Actions
          </div>
          <div className="space-y-2">
            {(scenario.availableActions ?? []).map((actionId: string) => {
              const applied = appliedActions.has(actionId)
              return (
                <button
                  key={actionId}
                  onClick={() => handleAction(actionId)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg transition-all"
                  style={{
                    backgroundColor: applied ? def.color + '22' : '#0f172a',
                    border: `1px solid ${applied ? def.color + '66' : '#334155'}`,
                    color: applied ? def.color : '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span>{applied ? '✓' : '→'}</span>
                    <span>{labelFromActionId(actionId)}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Difficulty + concepts */}
          <div className="mt-6 pt-4 border-t border-slate-700">
            <span
              className="text-xs px-2 py-0.5 rounded inline-block mb-3"
              style={{ backgroundColor: diffColor + '22', color: diffColor }}
            >
              {DIFFICULTY_LABELS[scenario.difficulty] ?? scenario.difficulty}
            </span>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Concepts</div>
            <div className="flex flex-wrap gap-1">
              {(scenario.coverConcepts ?? []).map((c: string) => (
                <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                  {c.replace(/-/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricBadge({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-xs font-mono font-medium" style={{ color: warn ? '#f87171' : '#e2e8f0' }}>
        {value}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}
