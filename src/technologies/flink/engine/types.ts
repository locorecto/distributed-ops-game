export type JobStatus = 'running' | 'failing' | 'restarting' | 'finished' | 'canceled' | 'created'
export type CheckpointStatus = 'completed' | 'failed' | 'in-progress' | 'discarded'
export type StateBackendType = 'heap' | 'rocksdb'
export type WindowType = 'tumbling' | 'sliding' | 'session' | 'global'

export interface OperatorConfig {
  id: string
  name: string
  parallelism: number
  type: 'source' | 'map' | 'filter' | 'keyBy' | 'window' | 'aggregate' | 'sink'
  stateBackend: StateBackendType
  checkpointIntervalMs: number
}

export interface OperatorState {
  config: OperatorConfig
  status: 'running' | 'backpressured' | 'idle' | 'failed'
  inputRate: number        // records/s
  outputRate: number       // records/s
  backpressureRatio: number // 0-1
  stateSize: number        // MB
  latencyMs: number
  watermarkMs: number | null
  checkpointsCompleted: number
  checkpointsFailed: number
}

export interface TaskManagerState {
  id: string
  isOnline: boolean
  slots: number
  usedSlots: number
  heapUsedMb: number
  maxHeapMb: number
  networkBuffersUsed: number
  networkBuffersTotal: number
}

export interface CheckpointState {
  id: number
  status: CheckpointStatus
  duration: number  // ms
  stateSize: number // MB
  triggeredAt: number // tick
  completedAt: number | null
}

export interface FlinkMetrics {
  jobStatus: JobStatus
  recordsPerSecond: number
  latencyMs: number          // end-to-end
  backpressureRatio: number  // 0-1
  checkpointDurationMs: number
  checkpointFailureRate: number
  restartCount: number
  watermarkLag: number       // ms
  heapPressure: number       // 0-1
  errorRate: number          // 0-1
}

export interface FlinkSnapshot {
  tickNumber: number
  operators: Map<string, OperatorState>
  taskManagers: Map<string, TaskManagerState>
  checkpoints: CheckpointState[]
  metrics: FlinkMetrics
  systemHealthScore: number
  activeFailures: string[]
}

export interface FlinkVictoryCondition {
  id: string
  description: string
  required: boolean
  check: (s: FlinkSnapshot) => boolean
}

export interface FlinkHint {
  order: number
  triggerOnHealthBelow: number
  text: string
  relatedConcept: string
}

export interface FlinkConceptCard {
  concept: string
  title: string
  body: string
  showWhenFixed: boolean
}

export interface FlinkScenarioDefinition {
  id: string
  index: number
  title: string
  subtitle: string
  difficulty: 'beginner' | 'easy' | 'medium' | 'medium-hard' | 'hard' | 'expert' | 'master'
  estimatedMinutes: number
  coverConcepts: string[]
  briefing: { story: string; symptom: string; goal: string; hints: FlinkHint[] }
  initialTopology: {
    operators: OperatorConfig[]
    taskManagers: Array<{ id: string; slots: number; maxHeapMb: number }>
    checkpointIntervalMs: number
    stateBackend: StateBackendType
  }
  failureScript: Array<{ atTick: number; type: string; target: string; params: Record<string, unknown> }>
  victoryConditions: FlinkVictoryCondition[]
  conceptCards: FlinkConceptCard[]
  availableActions: string[]
}
