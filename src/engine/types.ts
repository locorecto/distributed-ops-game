// ─── Core identifiers ────────────────────────────────────────────────────────
export type TopicName = string
export type PartitionId = number
export type BrokerId = number
export type GroupId = string
export type ConsumerId = string
export type ProducerId = string
export type Offset = number
export type PartitionKey = `${TopicName}:${PartitionId}`

// ─── Message ─────────────────────────────────────────────────────────────────
export interface KafkaMessage {
  id: string
  key: string | null
  value: unknown
  timestamp: number       // simulated tick
  partition: PartitionId
  offset: Offset
  sizeBytes: number
  headers: Record<string, string>
  isDuplicate?: boolean
  isTransactional?: boolean
  transactionId?: string
  schemaVersion?: number
}

// ─── Topic / Partition ───────────────────────────────────────────────────────
export type CleanupPolicy = 'delete' | 'compact'
export type CompressionType = 'none' | 'snappy' | 'gzip' | 'lz4' | 'zstd'

export interface TopicConfig {
  name: TopicName
  partitionCount: number
  replicationFactor: number
  retentionMs: number
  retentionBytes: number
  cleanupPolicy: CleanupPolicy
  minInsyncReplicas: number
  messageMaxBytes: number
}

export interface PartitionState {
  id: PartitionId
  topicName: TopicName
  leaderId: BrokerId
  replicaIds: BrokerId[]
  isrIds: BrokerId[]
  messages: KafkaMessage[]
  logStartOffset: Offset
  logEndOffset: Offset
  highWatermark: Offset
  bytesUsed: number
  isHot: boolean         // overloaded partition indicator
}

export interface TopicState {
  config: TopicConfig
  partitions: Map<PartitionId, PartitionState>
}

// ─── Producer ────────────────────────────────────────────────────────────────
export type AcksMode = 0 | 1 | -1
export type KeyStrategy = 'null' | 'round-robin' | 'fixed' | 'random' | 'custom'

export interface ProducerConfig {
  id: ProducerId
  targetTopic: TopicName
  acks: AcksMode
  retries: number
  retryBackoffMs: number
  idempotent: boolean
  transactional: boolean
  transactionalId?: string
  batchSizeBytes: number
  lingerMs: number
  compressionType: CompressionType
  messagesPerSecond: number
  keyStrategy: KeyStrategy
  fixedKey?: string
  messageSizeBytes: number
  maxRequestSizeBytes: number
  schemaVersion?: number
}

export interface ProducerState {
  config: ProducerConfig
  totalSent: number
  totalFailed: number
  totalDuplicates: number
  pendingBatchSize: number
  producerEpoch: number
  lastSequenceNumbers: Map<PartitionId, number>
  isHealthy: boolean
  sendRate: number           // messages/sec rolling average
  errorRate: number          // 0–1
  roundRobinIndex: number
  activeTransactionId: string | null
}

// ─── Consumer ────────────────────────────────────────────────────────────────
export type AutoOffsetReset = 'earliest' | 'latest'
export type IsolationLevel = 'read_uncommitted' | 'read_committed'

export interface ConsumerConfig {
  id: ConsumerId
  groupId: GroupId
  subscribedTopics: TopicName[]
  autoOffsetReset: AutoOffsetReset
  enableAutoCommit: boolean
  autoCommitIntervalMs: number
  maxPollRecords: number
  sessionTimeoutMs: number
  heartbeatIntervalMs: number
  maxPollIntervalMs: number
  fetchMinBytes: number
  fetchMaxWaitMs: number
  fetchMaxBytes: number
  maxPartitionFetchBytes: number
  processingTimeMs: number
  errorRate: number
  isolationLevel: IsolationLevel
  dlqEnabled: boolean
  maxRetries: number
  schemaVersion?: number
}

export interface ConsumerState {
  config: ConsumerConfig
  committedOffsets: Map<PartitionKey, Offset>
  currentOffsets: Map<PartitionKey, Offset>
  assignedPartitions: Map<TopicName, PartitionId[]>
  lag: number
  isActive: boolean
  lastHeartbeatTick: number
  lastPollTick: number
  totalProcessed: number
  totalFailed: number
  dlqMessages: KafkaMessage[]
  processingBacklog: number
  slaBreaches: number
}

// ─── Consumer Group ──────────────────────────────────────────────────────────
export type GroupState = 'stable' | 'rebalancing' | 'empty' | 'dead'

export interface ConsumerGroupState {
  groupId: GroupId
  members: ConsumerId[]
  partitionAssignment: Map<PartitionKey, ConsumerId>
  state: GroupState
  rebalanceCount: number
  rebalancingTicksLeft: number
  coordinatorBrokerId: BrokerId
  missedMessages: number   // for auto.offset.reset=latest scenarios
}

// ─── Broker ──────────────────────────────────────────────────────────────────
export interface BrokerConfig {
  id: BrokerId
  diskCapacityBytes: number
}

export interface BrokerState {
  config: BrokerConfig
  isOnline: boolean
  isController: boolean
  diskUsedBytes: number
  cpuPercent: number
  partitionsLeading: PartitionId[]
  partitionsFollowing: PartitionId[]
  replicationLagBytes: number
}

// ─── Failures ────────────────────────────────────────────────────────────────
export type FailureType =
  | 'broker-down'
  | 'consumer-lag-spike'
  | 'producer-rate-spike'
  | 'consumer-slow'
  | 'partition-imbalance'
  | 'retention-overflow'
  | 'consumer-crash'
  | 'duplicate-messages'
  | 'message-ordering-violation'
  | 'schema-incompatibility'
  | 'dlq-overflow'
  | 'record-too-large'
  | 'replication-failure'
  | 'sla-breach'
  | 'no-key-hot-partition'

export interface FailureEvent {
  atTick: number
  type: FailureType
  target: string
  params: Record<string, unknown>
  revealAtTick?: number
}

export interface ActiveFailure {
  id: string
  type: FailureType
  startedAtTick: number
  affectedEntities: string[]
  severity: 'low' | 'medium' | 'high' | 'critical'
  isVisible: boolean
}

// ─── Stream Processor ────────────────────────────────────────────────────────
export type WindowType = 'tumbling' | 'sliding' | 'session'

export interface StreamProcessorConfig {
  id: string
  inputTopics: TopicName[]
  outputTopic: TopicName
  windowType: WindowType
  windowSizeMs: number
  operation: 'count' | 'sum' | 'join' | 'filter'
  stateStoreId: string
}

export interface StreamProcessorState {
  config: StreamProcessorConfig
  windowBuffer: Map<string, KafkaMessage[]>
  stateStore: Map<string, unknown>
  processedCount: number
  lagMs: number
  isHealthy: boolean
}

// ─── Connector ───────────────────────────────────────────────────────────────
export interface ConnectorConfig {
  id: string
  type: 'source' | 'sink'
  targetTopic: TopicName
  pollIntervalMs: number
  schemaVersion?: number
  compatibilityMode?: 'NONE' | 'BACKWARD' | 'FORWARD' | 'FULL' | 'BACKWARD_TRANSITIVE'
}

export interface ConnectorState {
  config: ConnectorConfig
  isRunning: boolean
  totalProcessed: number
  errorCount: number
  lastSchemaVersion: number
  deserializationErrors: number
}

// ─── Mirror Maker ────────────────────────────────────────────────────────────
export interface MirrorLinkConfig {
  id: string
  sourceCluster: string
  targetCluster: string
  topics: TopicName[]
  replicationFactor: number
}

export interface MirrorLinkState {
  config: MirrorLinkConfig
  replicationLagMessages: number
  isActive: boolean
  bytesReplicatedPerSec: number
}

// ─── Metrics ─────────────────────────────────────────────────────────────────
export interface MetricsSnapshot {
  messagesPerSecIn: number
  messagesPerSecOut: number
  totalLag: number
  errorRate: number
  underReplicatedPartitions: number
  offlinePartitions: number
  activeBrokers: number
  dlqDepth: number
  duplicateCount: number
  orderingViolations: number
  batchEfficiency: number      // 0–1 (1 = perfect batching)
  compressionRatio: number     // bytes saved / bytes original
  slaBreaches: number
  deserializationErrors: number
}

export interface MetricsDataPoint extends MetricsSnapshot {
  tick: number
  timestamp: number
  healthScore: number
}

// ─── Simulation Snapshot ─────────────────────────────────────────────────────
export interface SimulationSnapshot {
  tickNumber: number
  wallTime: number
  brokers: Map<BrokerId, BrokerState>
  topics: Map<TopicName, TopicState>
  producers: Map<ProducerId, ProducerState>
  consumers: Map<ConsumerId, ConsumerState>
  consumerGroups: Map<GroupId, ConsumerGroupState>
  streamProcessors: Map<string, StreamProcessorState>
  connectors: Map<string, ConnectorState>
  mirrorLinks: Map<string, MirrorLinkState>
  systemHealthScore: number
  activeFailures: ActiveFailure[]
  metrics: MetricsSnapshot
}

// ─── Scenario Types ──────────────────────────────────────────────────────────
export type Difficulty =
  | 'beginner'
  | 'easy'
  | 'medium'
  | 'medium-hard'
  | 'hard'
  | 'expert'
  | 'master'

export type KafkaConcept =
  | 'topic' | 'partition' | 'producer' | 'consumer'
  | 'consumer-group' | 'consumer-lag' | 'offset'
  | 'auto-commit' | 'manual-commit' | 'at-least-once'
  | 'message-key' | 'key-routing' | 'hot-partition'
  | 'batching' | 'compression' | 'linger-ms' | 'batch-size'
  | 'idempotent-producer' | 'exactly-once' | 'message-ordering'
  | 'transaction' | 'read-process-write' | 'isolation-level'
  | 'retention-time' | 'retention-bytes' | 'log-compaction'
  | 'replication-factor' | 'isr' | 'broker-failure' | 'min-isr'
  | 'dlq' | 'retry-logic' | 'error-handling'
  | 'session-timeout' | 'poll-interval' | 'heartbeat' | 'sla'
  | 'kafka-streams' | 'windowing' | 'stateful-joins'
  | 'kafka-connect' | 'schema-evolution' | 'avro' | 'schema-registry'
  | 'mirrormaker' | 'multi-region'
  | 'message-size' | 'fetch-config' | 'large-messages'
  | 'auto-offset-reset' | 'consumer-group-isolation' | 'offset-reset'
  | 'fan-out'

export type ActionId =
  | 'add-partitions' | 'change-replication'
  | 'set-producer-acks' | 'enable-idempotence' | 'enable-transactions'
  | 'set-producer-key' | 'set-linger-ms' | 'set-batch-size' | 'set-compression'
  | 'set-message-size' | 'set-fetch-config'
  | 'set-consumer-group' | 'add-consumer' | 'remove-consumer' | 'set-max-poll-records'
  | 'set-offset-reset' | 'enable-manual-commit' | 'set-isolation-level'
  | 'set-session-timeout' | 'set-poll-interval' | 'set-heartbeat'
  | 'set-retention-ms' | 'set-retention-bytes' | 'set-cleanup-policy'
  | 'toggle-broker' | 'set-min-isr'
  | 'add-dlq' | 'configure-retry'
  | 'add-stream-processor' | 'configure-window'
  | 'add-connector' | 'set-schema' | 'set-compatibility-mode'
  | 'add-mirror-link'
  | 'reset-consumer-group-offset'
