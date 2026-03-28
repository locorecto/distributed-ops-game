import { nanoid } from 'nanoid'
import type { ProducerConfig, ProducerState, KafkaMessage } from './types'
import { KAFKA_DEFAULTS } from '../constants/kafka'

export function createProducerState(config: ProducerConfig): ProducerState {
  return {
    config,
    totalSent: 0,
    totalFailed: 0,
    totalDuplicates: 0,
    pendingBatchSize: 0,
    producerEpoch: 1,
    lastSequenceNumbers: new Map(),
    isHealthy: true,
    sendRate: 0,
    errorRate: 0,
    roundRobinIndex: 0,
    activeTransactionId: null,
  }
}

/**
 * Generate messages to produce this tick.
 * Returns array of partial messages (without partition/offset — assigned by topic).
 */
export function generateMessages(
  state: ProducerState,
  currentTick: number,
  tickRateMs: number,
  forceErrorRate?: number,
): Omit<KafkaMessage, 'partition' | 'offset' | 'id'>[] {
  const { config } = state
  const messagesThisTick = Math.round(config.messagesPerSecond / (1000 / tickRateMs))
  if (messagesThisTick === 0) return []

  const messages: Omit<KafkaMessage, 'partition' | 'offset' | 'id'>[] = []
  const errorRate = forceErrorRate ?? 0

  for (let i = 0; i < messagesThisTick; i++) {
    // skip if simulated error
    if (errorRate > 0 && Math.random() < errorRate) {
      state.totalFailed++
      continue
    }

    let key: string | null = null
    switch (config.keyStrategy) {
      case 'fixed':
        key = config.fixedKey ?? 'default-key'
        break
      case 'random':
        key = nanoid(8)
        break
      case 'round-robin':
        key = null // use round-robin in topic
        break
      case 'null':
      default:
        key = null
    }

    const isDuplicate = config.idempotent ? false : (Math.random() < 0.001)

    messages.push({
      key,
      value: { tick: currentTick, seq: state.totalSent + i },
      timestamp: currentTick,
      sizeBytes: config.messageSizeBytes,
      headers: {},
      isDuplicate,
      isTransactional: config.transactional,
      transactionId: config.transactional ? (config.transactionalId ?? config.id) : undefined,
      schemaVersion: config.schemaVersion,
    })
  }

  return messages
}

export function applyProducerConfigPatch(
  state: ProducerState,
  patch: Partial<ProducerConfig>,
): void {
  Object.assign(state.config, patch)
  // enabling idempotence forces acks=all and retries≥1
  if (patch.idempotent) {
    state.config.acks = -1
    if (state.config.retries === 0) state.config.retries = 3
    state.producerEpoch++
    state.lastSequenceNumbers.clear()
  }
}

export function updateProducerMetrics(state: ProducerState, sentThisTick: number, tickRateMs: number): void {
  state.totalSent += sentThisTick
  const alpha = 0.2
  state.sendRate = alpha * (sentThisTick * (1000 / tickRateMs)) + (1 - alpha) * state.sendRate
}

export const DEFAULT_PRODUCER_CONFIG: Omit<ProducerConfig, 'id' | 'targetTopic'> = {
  acks: KAFKA_DEFAULTS.producer.acks,
  retries: KAFKA_DEFAULTS.producer.retries,
  retryBackoffMs: KAFKA_DEFAULTS.producer.retryBackoffMs,
  idempotent: false,
  transactional: false,
  batchSizeBytes: KAFKA_DEFAULTS.producer.batchSizeBytes,
  lingerMs: KAFKA_DEFAULTS.producer.lingerMs,
  compressionType: 'none',
  messagesPerSecond: 10,
  keyStrategy: 'null',
  messageSizeBytes: 256,
  maxRequestSizeBytes: KAFKA_DEFAULTS.producer.maxRequestSizeBytes,
}
