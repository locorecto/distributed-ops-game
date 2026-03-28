import { nanoid } from 'nanoid'
import type {
  TopicConfig, TopicState, PartitionState, PartitionId, BrokerId,
  KafkaMessage, Offset, AcksMode,
} from './types'
import { hashKey } from '../utils/hashKey'
import { GAME } from '../constants/game'
import { COMPRESSION_RATIOS } from '../constants/kafka'

export function createTopicState(config: TopicConfig, brokerIds: BrokerId[]): TopicState {
  const partitions = new Map<PartitionId, PartitionState>()
  for (let i = 0; i < config.partitionCount; i++) {
    const leader = brokerIds[i % brokerIds.length]
    const replicas = brokerIds.slice(0, Math.min(config.replicationFactor, brokerIds.length))
    partitions.set(i, {
      id: i,
      topicName: config.name,
      leaderId: leader,
      replicaIds: replicas,
      isrIds: [...replicas],
      messages: [],
      logStartOffset: 0,
      logEndOffset: 0,
      highWatermark: 0,
      bytesUsed: 0,
      isHot: false,
    })
  }
  return { config, partitions }
}

export function addPartitions(topic: TopicState, count: number, brokerIds: BrokerId[]): void {
  const current = topic.config.partitionCount
  for (let i = current; i < current + count; i++) {
    const leader = brokerIds[i % brokerIds.length]
    const replicas = brokerIds.slice(0, Math.min(topic.config.replicationFactor, brokerIds.length))
    topic.partitions.set(i, {
      id: i,
      topicName: topic.config.name,
      leaderId: leader,
      replicaIds: replicas,
      isrIds: [...replicas],
      messages: [],
      logStartOffset: 0,
      logEndOffset: 0,
      highWatermark: 0,
      bytesUsed: 0,
      isHot: false,
    })
  }
  topic.config.partitionCount += count
}

export interface ProduceResult {
  success: boolean
  reason?: string
  messagesWritten: number
  bytesWritten: number
}

export function produceMessages(
  topic: TopicState,
  messages: Omit<KafkaMessage, 'partition' | 'offset' | 'id'>[],
  acks: AcksMode,
  producerEpoch: number,
  partitionCount: number,
  roundRobinRef: { index: number },
  compressionType: string,
): ProduceResult {
  const compressionRatio = COMPRESSION_RATIOS[compressionType] ?? 1.0
  let written = 0
  let bytesWritten = 0

  for (const msg of messages) {
    // check size
    if (msg.sizeBytes > topic.config.messageMaxBytes) {
      return { success: false, reason: `RecordTooLargeException: message ${msg.sizeBytes}B > max ${topic.config.messageMaxBytes}B`, messagesWritten: written, bytesWritten }
    }

    // route to partition
    let partitionId: PartitionId
    if (msg.key !== null) {
      partitionId = hashKey(msg.key, partitionCount)
    } else {
      partitionId = roundRobinRef.index % partitionCount
      roundRobinRef.index++
    }

    const partition = topic.partitions.get(partitionId)
    if (!partition) continue

    // check acks requirements
    if (acks === -1 && partition.isrIds.length < topic.config.minInsyncReplicas) {
      return { success: false, reason: `NotEnoughReplicasException: ISR size ${partition.isrIds.length} < min.insync.replicas ${topic.config.minInsyncReplicas}`, messagesWritten: written, bytesWritten }
    }

    const offset: Offset = partition.logEndOffset
    const compressedSize = Math.round(msg.sizeBytes * compressionRatio)

    const fullMsg: KafkaMessage = {
      ...msg,
      id: nanoid(8),
      partition: partitionId,
      offset,
      sizeBytes: compressedSize,
    }

    partition.messages.push(fullMsg)
    partition.logEndOffset++
    partition.bytesUsed += compressedSize

    // advance HWM immediately for acks≠all (simplified; real Kafka waits for ISR)
    if (acks !== -1 || partition.isrIds.length >= topic.config.minInsyncReplicas) {
      partition.highWatermark = partition.logEndOffset
    }

    // trim log to keep memory bounded
    if (partition.messages.length > GAME.MAX_LOG_MESSAGES) {
      const removed = partition.messages.splice(0, partition.messages.length - GAME.MAX_LOG_MESSAGES)
      for (const m of removed) partition.logStartOffset = m.offset + 1
    }

    written++
    bytesWritten += compressedSize
  }

  updateHotPartitionFlags(topic)
  return { success: true, messagesWritten: written, bytesWritten }
}

function updateHotPartitionFlags(topic: TopicState): void {
  let maxMessages = 0
  topic.partitions.forEach(p => {
    if (p.messages.length > maxMessages) maxMessages = p.messages.length
  })
  topic.partitions.forEach(p => {
    p.isHot = maxMessages > 0 && p.messages.length > maxMessages * 0.8 && topic.partitions.size > 1
  })
}

export function applyRetention(topic: TopicState, currentTick: number, tickRateMs: number): void {
  topic.partitions.forEach(partition => {
    const { retentionMs, retentionBytes, cleanupPolicy } = topic.config
    const nowMs = currentTick * tickRateMs

    if (cleanupPolicy === 'compact') {
      compactPartition(partition)
      return
    }

    // time-based retention
    if (retentionMs > 0) {
      const cutoffMs = nowMs - retentionMs
      while (partition.messages.length > 0 && partition.messages[0].timestamp * tickRateMs < cutoffMs) {
        const removed = partition.messages.shift()!
        partition.logStartOffset = removed.offset + 1
        partition.bytesUsed = Math.max(0, partition.bytesUsed - removed.sizeBytes)
      }
    }

    // size-based retention
    if (retentionBytes > 0) {
      while (partition.bytesUsed > retentionBytes && partition.messages.length > 0) {
        const removed = partition.messages.shift()!
        partition.logStartOffset = removed.offset + 1
        partition.bytesUsed = Math.max(0, partition.bytesUsed - removed.sizeBytes)
      }
    }
  })
}

function compactPartition(partition: PartitionState): void {
  const latest = new Map<string, KafkaMessage>()
  for (const msg of partition.messages) {
    if (msg.key !== null) latest.set(msg.key, msg)
    else latest.set(msg.id, msg)
  }
  partition.messages = Array.from(latest.values()).sort((a, b) => a.offset - b.offset)
  partition.bytesUsed = partition.messages.reduce((s, m) => s + m.sizeBytes, 0)
}
