export type ESIndexState = 'green' | 'yellow' | 'red'
export type ShardState = 'started' | 'unassigned' | 'relocating' | 'initializing'
export type ILMPhase = 'hot' | 'warm' | 'cold' | 'delete'

export interface ESNodeConfig {
  id: string
  roles: ('master' | 'data' | 'ingest' | 'coordinating')[]
  heapGb: number
  diskGb: number
}

export interface ESNodeState {
  config: ESNodeConfig
  isOnline: boolean
  heapUsedPct: number   // 0-1
  diskUsedPct: number   // 0-1
  cpuPct: number        // 0-1
  jvmGcPressure: number // 0-1
  isMaster: boolean
}

export interface ESIndexConfig {
  name: string
  shards: number
  replicas: number
  refreshIntervalMs: number
  maxResultWindow: number
  ilmPolicy: string | null
}

export interface ESIndexStats {
  config: ESIndexConfig
  health: ESIndexState
  docsCount: number
  storeSizeGb: number
  searchRate: number   // req/s
  indexRate: number    // docs/s
  queryLatencyMs: number
  unassignedShards: number
}

export interface ESClientConfig {
  id: string
  targetIndex: string
  queryType: 'match' | 'term' | 'aggregation' | 'scroll' | 'bulk-index'
  requestsPerSec: number
}

export interface ESClientState {
  config: ESClientConfig
  isActive: boolean
  totalRequests: number
  totalErrors: number
  avgLatencyMs: number
  errorType: string | null
}

export interface ESMetrics {
  clusterHealth: ESIndexState
  totalShards: number
  activeShards: number
  unassignedShards: number
  avgQueryLatencyMs: number
  indexingRate: number
  searchRate: number
  errorRate: number
  heapPressure: number // 0-1
  diskPressure: number // 0-1
}

export interface ESSnapshot {
  tickNumber: number
  nodes: Map<string, ESNodeState>
  indices: Map<string, ESIndexStats>
  clients: Map<string, ESClientState>
  metrics: ESMetrics
  systemHealthScore: number
  activeFailures: string[]
}

export interface ESVictoryCondition {
  id: string
  description: string
  required: boolean
  check: (s: ESSnapshot) => boolean
}

export interface ESHint {
  order: number
  triggerOnHealthBelow: number
  text: string
  relatedConcept: string
}

export interface ESConceptCard {
  concept: string
  title: string
  body: string
  showWhenFixed: boolean
}

export interface ESScenarioDefinition {
  id: string
  index: number
  title: string
  subtitle: string
  difficulty: 'beginner' | 'easy' | 'medium' | 'medium-hard' | 'hard' | 'expert' | 'master'
  estimatedMinutes: number
  coverConcepts: string[]
  briefing: { story: string; symptom: string; goal: string; hints: ESHint[] }
  initialTopology: {
    nodes: ESNodeConfig[]
    indices: ESIndexConfig[]
    clients: ESClientConfig[]
  }
  failureScript: Array<{ atTick: number; type: string; target: string; params: Record<string, unknown> }>
  victoryConditions: ESVictoryCondition[]
  conceptCards: ESConceptCard[]
  availableActions: string[]
}
