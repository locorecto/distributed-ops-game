import type {
  ConsumerConfig, ConsumerState, TopicState, PartitionKey,
} from './types'
import {
  getCommittedOffset, advanceCurrentOffset, commitOffset,
  autoCommitIfDue, computeLag,
} from './OffsetManager'
import { KAFKA_DEFAULTS } from '../constants/kafka'

export function createConsumerState(config: ConsumerConfig): ConsumerState {
  return {
    config,
    committedOffsets: new Map(),
    currentOffsets: new Map(),
    assignedPartitions: new Map(),
    lag: 0,
    isActive: true,
    lastHeartbeatTick: 0,
    lastPollTick: 0,
    totalProcessed: 0,
    totalFailed: 0,
    dlqMessages: [],
    processingBacklog: 0,
    slaBreaches: 0,
  }
}

export function initOffsets(
  state: ConsumerState,
  topics: Map<string, TopicState>,
): void {
  state.assignedPartitions.forEach((partitionIds, topicName) => {
    const topic = topics.get(topicName)
    if (!topic) return
    for (const pid of partitionIds) {
      const key: PartitionKey = `${topicName}:${pid}`
      if (!state.committedOffsets.has(key)) {
        const partition = topic.partitions.get(pid)
        if (!partition) continue
        const startOffset = state.config.autoOffsetReset === 'earliest'
          ? partition.logStartOffset
          : partition.logEndOffset
        state.committedOffsets.set(key, startOffset - 1)
        state.currentOffsets.set(key, startOffset - 1)
      }
    }
  })
}

/**
 * Poll and process messages for one tick.
 */
export function pollAndProcess(
  state: ConsumerState,
  topics: Map<string, TopicState>,
  currentTick: number,
  tickRateMs: number,
  slaMs?: number,
): void {
  if (!state.isActive) return

  // heartbeat detection
  const sessionTimeoutTicks = state.config.sessionTimeoutMs / tickRateMs
  if (currentTick - state.lastHeartbeatTick > sessionTimeoutTicks) {
    state.isActive = false
    return
  }

  // poll interval violation detection
  const maxPollTicks = state.config.maxPollIntervalMs / tickRateMs
  if (state.lastPollTick > 0 && currentTick - state.lastPollTick > maxPollTicks) {
    state.isActive = false
    return
  }

  state.lastHeartbeatTick = currentTick
  state.lastPollTick = currentTick

  const partitionEndOffsets = new Map<PartitionKey, number>()

  let processed = 0
  // processingTimeMs throttles effective throughput: a 50ms processing time
  // on a 100ms tick means at most 2 messages can be processed per tick.
  const throughputCap = Math.max(1, Math.floor(tickRateMs / Math.max(1, state.config.processingTimeMs)))
  const maxRecords = Math.min(state.config.maxPollRecords, throughputCap)

  state.assignedPartitions.forEach((partitionIds, topicName) => {
    const topic = topics.get(topicName)
    if (!topic) return

    for (const pid of partitionIds) {
      const key: PartitionKey = `${topicName}:${pid}`
      const partition = topic.partitions.get(pid)
      if (!partition) continue

      // Always record the high watermark so computeLag sees ALL assigned partitions,
      // even those the consumer couldn't reach this tick due to maxRecords limit.
      partitionEndOffsets.set(key, partition.highWatermark)

      if (processed >= maxRecords) continue  // no capacity left this tick — skip processing

      const committed = getCommittedOffset(state, key)
      const startRead = committed + 1

      // isolation level filter
      const hwm = state.config.isolationLevel === 'read_committed'
        ? partition.highWatermark
        : partition.logEndOffset

      const available = partition.messages.filter(
        m => m.offset >= startRead && m.offset < hwm
      )

      const batch = available.slice(0, maxRecords - processed)
      if (batch.length === 0) continue

      for (const msg of batch) {
        // schema version mismatch
        if (state.config.schemaVersion != null && msg.schemaVersion != null
          && msg.schemaVersion > state.config.schemaVersion) {
          state.totalFailed++
          state.config.dlqEnabled
            ? state.dlqMessages.push(msg)
            : null
          advanceCurrentOffset(state, key, msg.offset)
          commitOffset(state, key, msg.offset)
          continue
        }

        // simulate processing error
        if (Math.random() < state.config.errorRate) {
          state.totalFailed++
          if (state.config.dlqEnabled && state.dlqMessages.length < 1000) {
            state.dlqMessages.push(msg)
          }
          advanceCurrentOffset(state, key, msg.offset)
          if (state.config.enableAutoCommit) commitOffset(state, key, msg.offset)
          continue
        }

        advanceCurrentOffset(state, key, msg.offset)
        if (state.config.enableAutoCommit) commitOffset(state, key, msg.offset)

        processed++

        // SLA tracking
        if (slaMs != null) {
          const processingLatency = state.config.processingTimeMs
          if (processingLatency > slaMs) state.slaBreaches++
        }
      }
    }
  })

  state.totalProcessed += processed

  // auto-commit on interval
  autoCommitIfDue(state, currentTick, tickRateMs)

  // compute lag
  computeLag(state, partitionEndOffsets)
}

export function manualCommitAll(state: ConsumerState): void {
  state.currentOffsets.forEach((offset, key) => {
    state.committedOffsets.set(key, offset)
  })
}

export const DEFAULT_CONSUMER_CONFIG: Omit<ConsumerConfig, 'id' | 'groupId' | 'subscribedTopics'> = {
  autoOffsetReset: KAFKA_DEFAULTS.consumer.autoOffsetReset,
  enableAutoCommit: KAFKA_DEFAULTS.consumer.enableAutoCommit,
  autoCommitIntervalMs: KAFKA_DEFAULTS.consumer.autoCommitIntervalMs,
  maxPollRecords: KAFKA_DEFAULTS.consumer.maxPollRecords,
  sessionTimeoutMs: KAFKA_DEFAULTS.consumer.sessionTimeoutMs,
  heartbeatIntervalMs: KAFKA_DEFAULTS.consumer.heartbeatIntervalMs,
  maxPollIntervalMs: KAFKA_DEFAULTS.consumer.maxPollIntervalMs,
  fetchMinBytes: KAFKA_DEFAULTS.consumer.fetchMinBytes,
  fetchMaxWaitMs: KAFKA_DEFAULTS.consumer.fetchMaxWaitMs,
  fetchMaxBytes: KAFKA_DEFAULTS.consumer.fetchMaxBytes,
  maxPartitionFetchBytes: KAFKA_DEFAULTS.consumer.maxPartitionFetchBytes,
  processingTimeMs: KAFKA_DEFAULTS.consumer.processingTimeMs,
  errorRate: 0,
  isolationLevel: 'read_uncommitted',
  dlqEnabled: false,
  maxRetries: 3,
}
