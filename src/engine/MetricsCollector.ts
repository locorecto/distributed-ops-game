import type {
  SimulationSnapshot, MetricsSnapshot, MetricsDataPoint,
} from './types'
import { GAME } from '../constants/game'
import { countUnderReplicatedPartitions } from './KafkaBroker'

export function collectMetrics(
  snapshot: Omit<SimulationSnapshot, 'metrics' | 'systemHealthScore'>,
  prevMetrics: MetricsSnapshot,
): MetricsSnapshot {
  let totalLag = 0
  let totalFailed = 0
  let totalProcessed = 0
  let dlqDepth = 0
  let totalDuplicates = 0
  let orderingViolations = 0
  let slaBreaches = 0
  let deserializationErrors = 0

  snapshot.consumers.forEach(c => {
    totalLag += c.lag
    totalFailed += c.totalFailed
    totalProcessed += c.totalProcessed
    dlqDepth += c.dlqMessages.length
    slaBreaches += c.slaBreaches
  })

  snapshot.producers.forEach(p => {
    totalDuplicates += p.totalDuplicates
  })

  snapshot.connectors.forEach(c => {
    deserializationErrors += c.deserializationErrors
  })

  const alpha = 0.3 // EMA smoothing

  const messagesPerSecIn = alpha * snapshot.producers.size * 10 + (1 - alpha) * prevMetrics.messagesPerSecIn
  const messagesPerSecOut = alpha * (totalProcessed > 0 ? totalProcessed * 10 : 0) + (1 - alpha) * prevMetrics.messagesPerSecOut
  const errorRate = totalFailed + totalProcessed > 0 ? totalFailed / (totalFailed + totalProcessed) : 0

  let activeBrokers = 0
  snapshot.brokers.forEach(b => { if (b.isOnline) activeBrokers++ })

  let offlinePartitions = 0
  snapshot.topics.forEach(t => {
    t.partitions.forEach(p => {
      const leader = snapshot.brokers.get(p.leaderId)
      if (!leader?.isOnline) offlinePartitions++
    })
  })

  const underReplicatedPartitions = countUnderReplicatedPartitions(snapshot.topics)

  return {
    messagesPerSecIn,
    messagesPerSecOut,
    totalLag,
    errorRate,
    underReplicatedPartitions,
    offlinePartitions,
    activeBrokers,
    dlqDepth,
    duplicateCount: totalDuplicates,
    orderingViolations,
    batchEfficiency: 0.8,
    compressionRatio: 0,
    slaBreaches,
    deserializationErrors,
  }
}

export function computeHealthScore(metrics: MetricsSnapshot, maxLag = 1000): number {
  const { LAG_WEIGHT, BROKER_WEIGHT, ERROR_WEIGHT, DLQ_WEIGHT, REPLICA_WEIGHT } = GAME.HEALTH

  const lagScore = Math.max(0, 1 - metrics.totalLag / maxLag)
  const brokerScore = metrics.activeBrokers > 0
    ? Math.max(0, 1 - metrics.offlinePartitions / Math.max(1, metrics.activeBrokers * 3))
    : 0
  const errorScore = Math.max(0, 1 - metrics.errorRate * 5)
  const dlqScore = Math.max(0, 1 - metrics.dlqDepth / 200)
  const replicaScore = metrics.underReplicatedPartitions === 0 ? 1 : 0.3

  const raw = (
    LAG_WEIGHT * lagScore +
    BROKER_WEIGHT * brokerScore +
    ERROR_WEIGHT * errorScore +
    DLQ_WEIGHT * dlqScore +
    REPLICA_WEIGHT * replicaScore
  )

  return Math.round(Math.min(100, Math.max(0, raw * 100)))
}

export function makeDataPoint(
  tick: number,
  metrics: MetricsSnapshot,
  healthScore: number,
): MetricsDataPoint {
  return {
    ...metrics,
    tick,
    timestamp: Date.now(),
    healthScore,
  }
}
