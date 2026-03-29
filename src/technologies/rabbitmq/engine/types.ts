export type ExchangeType = 'direct' | 'topic' | 'fanout' | 'headers'
export type QueueType = 'classic' | 'quorum' | 'stream'
export type AckMode = 'auto' | 'manual' | 'none'

export interface ExchangeConfig {
  name: string
  type: ExchangeType
  durable: boolean
  autoDelete: boolean
}

export interface QueueConfig {
  name: string
  type: QueueType
  durable: boolean
  exclusive: boolean
  autoDelete: boolean
  maxLength: number | null     // null = unlimited
  messageTtlMs: number | null  // null = no TTL
  deadLetterExchange: string | null
  deadLetterRoutingKey: string | null
  maxPriority: number | null
  lazyMode: boolean
}

export interface BindingConfig {
  exchange: string
  queue: string
  routingKey: string
}

export interface PublisherConfig {
  id: string
  targetExchange: string
  routingKey: string
  messagesPerSecond: number
  messageSizeBytes: number
  confirmMode: boolean
  persistent: boolean
}

export interface ConsumerConfig {
  id: string
  queue: string
  prefetchCount: number
  ackMode: AckMode
  processingTimeMs: number
  errorRate: number
}

export interface QueueState {
  config: QueueConfig
  depth: number            // messages ready
  unacked: number          // in-flight
  dlqDepth: number
  consumersCount: number
  enqueueRate: number
  dequeueRate: number
  memoryUsedMb: number
}

export interface PublisherState {
  config: PublisherConfig
  isActive: boolean
  totalSent: number
  totalUnconfirmed: number
  totalFailed: number
  blocked: boolean  // flow control
}

export interface ConsumerState {
  config: ConsumerConfig
  isActive: boolean
  totalAcked: number
  totalNacked: number
  totalErrors: number
  avgProcessingMs: number
}

export interface RabbitMQNodeState {
  id: string
  isOnline: boolean
  memoryUsedMb: number
  maxMemoryMb: number
  diskFreeMb: number
  minDiskFreeMb: number
  connectionsCount: number
  maxConnections: number
  isMemoryAlarm: boolean
  isDiskAlarm: boolean
}

export interface RMQMetrics {
  totalMessagesReady: number
  totalMessagesUnacked: number
  totalPublishRate: number
  totalConsumeRate: number
  errorRate: number
  memoryUsageRatio: number
  diskUsageRatio: number
  blockedPublishers: number
  dlqDepth: number
}

export interface RMQSnapshot {
  tickNumber: number
  nodes: Map<string, RabbitMQNodeState>
  queues: Map<string, QueueState>
  publishers: Map<string, PublisherState>
  consumers: Map<string, ConsumerState>
  metrics: RMQMetrics
  systemHealthScore: number
  activeFailures: string[]
}

export interface RMQVictoryCondition {
  id: string
  description: string
  required: boolean
  check: (s: RMQSnapshot) => boolean
}

export interface RMQHint {
  order: number
  triggerOnHealthBelow: number
  text: string
  relatedConcept: string
}

export interface RMQConceptCard {
  concept: string
  title: string
  body: string
  showWhenFixed: boolean
}

export interface RMQScenarioDefinition {
  id: string
  index: number
  title: string
  subtitle: string
  difficulty: 'beginner' | 'easy' | 'medium' | 'medium-hard' | 'hard' | 'expert' | 'master'
  estimatedMinutes: number
  coverConcepts: string[]
  briefing: { story: string; symptom: string; goal: string; hints: RMQHint[] }
  initialTopology: {
    nodes: Array<{ id: string; maxMemoryMb: number; minDiskFreeMb: number; maxConnections: number }>
    exchanges: ExchangeConfig[]
    queues: QueueConfig[]
    bindings: BindingConfig[]
    publishers: PublisherConfig[]
    consumers: ConsumerConfig[]
  }
  failureScript: Array<{ atTick: number; type: string; target: string; params: Record<string, unknown> }>
  victoryConditions: RMQVictoryCondition[]
  conceptCards: RMQConceptCard[]
  availableActions: string[]
}
