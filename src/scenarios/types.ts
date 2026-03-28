import type {
  Difficulty, KafkaConcept, ActionId, FailureEvent,
  TopicConfig,
} from '../engine/types'

// ─── Scenario Definition ─────────────────────────────────────────────────────

export interface ScenarioDefinition {
  id: string
  index: number
  title: string
  subtitle: string
  difficulty: Difficulty
  estimatedMinutes: number
  coverConcepts: KafkaConcept[]

  briefing: {
    story: string
    symptom: string
    goal: string
    hints: HintDefinition[]
  }

  initialTopology: TopologyDefinition
  failureScript: FailureEvent[]
  victoryConditions: VictoryConditionDef[]
  conceptCards: ConceptCardDef[]
  availableActions: ActionId[]

  // engine tuning per scenario
  maxLagForHealth?: number
  slaMs?: number
}

// ─── Topology ────────────────────────────────────────────────────────────────

export interface TopologyDefinition {
  brokers: BrokerInitConfig[]
  topics: TopicConfig[]
  producers: ProducerInitConfig[]
  consumers: ConsumerInitConfig[]
}

export interface BrokerInitConfig {
  id: number
  diskCapacityBytes?: number
}

export interface ProducerInitConfig {
  id: string
  targetTopic: string
  messagesPerSecond: number
  acks: 0 | 1 | -1
  retries?: number
  retryBackoffMs?: number
  idempotent?: boolean
  transactional?: boolean
  transactionalId?: string
  batchSizeBytes?: number
  lingerMs?: number
  compressionType?: string
  keyStrategy: 'null' | 'round-robin' | 'fixed' | 'random' | 'custom'
  fixedKey?: string
  messageSizeBytes?: number
  maxRequestSizeBytes?: number
  schemaVersion?: number
}

export interface ConsumerInitConfig {
  id: string
  groupId: string
  subscribedTopics: string[]
  autoOffsetReset: 'earliest' | 'latest'
  enableAutoCommit: boolean
  autoCommitIntervalMs?: number
  maxPollRecords: number
  sessionTimeoutMs?: number
  heartbeatIntervalMs?: number
  maxPollIntervalMs?: number
  processingTimeMs: number
  errorRate?: number
  isolationLevel?: 'read_uncommitted' | 'read_committed'
  dlqEnabled?: boolean
  maxRetries?: number
  schemaVersion?: number
  fetchMaxBytes?: number
  maxPartitionFetchBytes?: number
}

// ─── Hints ───────────────────────────────────────────────────────────────────

export interface HintDefinition {
  order: number
  triggerAfterTick?: number
  triggerOnHealthBelow?: number
  text: string
  relatedConcept: KafkaConcept
  highlightElements?: string[]
}

// ─── Victory Conditions ──────────────────────────────────────────────────────

export interface VictoryConditionDef {
  id: string
  description: string
  required: boolean
  check: (snapshot: import('../engine/types').SimulationSnapshot) => boolean
}

// ─── Concept Cards ───────────────────────────────────────────────────────────

export interface ConceptCardDef {
  concept: KafkaConcept
  title: string
  body: string
  showWhenFixed?: boolean
}
