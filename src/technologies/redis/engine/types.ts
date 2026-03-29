export type RedisDataType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'json'
export type RedisEvictionPolicy = 'noeviction' | 'allkeys-lru' | 'volatile-lru' | 'allkeys-lfu' | 'volatile-lfu' | 'allkeys-random' | 'volatile-ttl'
export type RedisPersistenceMode = 'none' | 'rdb' | 'aof' | 'rdb+aof'
export type RedisClusterMode = 'standalone' | 'sentinel' | 'cluster'

export interface RedisNodeConfig {
  id: string
  role: 'master' | 'replica' | 'sentinel'
  maxMemoryMb: number
  evictionPolicy: RedisEvictionPolicy
  persistenceMode: RedisPersistenceMode
  appendfsync: 'always' | 'everysec' | 'no'
  maxClients: number
}

export interface RedisKeyState {
  key: string
  type: RedisDataType
  sizeBytes: number
  ttlMs: number | null   // null = no expiry
  lastAccessedAt: number // tick
}

export interface RedisNodeState {
  config: RedisNodeConfig
  isOnline: boolean
  usedMemoryMb: number
  keyCount: number
  connectedClients: number
  replicationLagMs: number
  hitRate: number    // 0-1
  opsPerSec: number
  evictedKeys: number
  expiredKeys: number
}

export interface RedisClientConfig {
  id: string
  targetNode: string
  opsPerSecond: number
  readRatio: number  // 0-1
  keyPattern: 'sequential' | 'random' | 'hot-key' | 'uniform'
  valueSize: 'small' | 'medium' | 'large' // 100B | 10KB | 1MB
}

export interface RedisClientState {
  config: RedisClientConfig
  isActive: boolean
  totalOps: number
  totalErrors: number
  avgLatencyMs: number
  errorType: string | null
}

export interface RedisMetrics {
  totalOpsPerSec: number
  avgLatencyMs: number
  errorRate: number       // 0-1
  cacheHitRate: number    // 0-1
  memoryUsageRatio: number // 0-1
  replicationLag: number  // ms
  connectedClients: number
  evictedKeysPerSec: number
}

export interface RedisSnapshot {
  tickNumber: number
  nodes: Map<string, RedisNodeState>
  clients: Map<string, RedisClientState>
  metrics: RedisMetrics
  systemHealthScore: number  // 0-100
  activeFailures: string[]
}

export interface RedisScenarioTopology {
  nodes: RedisNodeConfig[]
  clients: RedisClientConfig[]
  clusterMode: RedisClusterMode
}

export interface RedisVictoryCondition {
  id: string
  description: string
  required: boolean
  check: (s: RedisSnapshot) => boolean
}

export interface RedisHint {
  order: number
  triggerOnHealthBelow: number
  text: string
  relatedConcept: string
}

export interface RedisConceptCard {
  concept: string
  title: string
  body: string
  showWhenFixed: boolean
}

export interface RedisScenarioDefinition {
  id: string
  index: number
  title: string
  subtitle: string
  difficulty: 'beginner' | 'easy' | 'medium' | 'medium-hard' | 'hard' | 'expert' | 'master'
  estimatedMinutes: number
  coverConcepts: string[]
  briefing: {
    story: string
    symptom: string
    goal: string
    hints: RedisHint[]
  }
  initialTopology: RedisScenarioTopology
  failureScript: Array<{ atTick: number; type: string; target: string; params: Record<string, unknown> }>
  victoryConditions: RedisVictoryCondition[]
  conceptCards: RedisConceptCard[]
  availableActions: string[]
}
