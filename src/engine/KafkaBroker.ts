import type { BrokerConfig, BrokerState, TopicState, BrokerId } from './types'

export function createBrokerState(config: BrokerConfig, isController = false): BrokerState {
  return {
    config,
    isOnline: true,
    isController,
    diskUsedBytes: 0,
    cpuPercent: 0,
    partitionsLeading: [],
    partitionsFollowing: [],
    replicationLagBytes: 0,
  }
}

export function updateBrokerMetrics(
  broker: BrokerState,
  topics: Map<string, TopicState>,
): void {
  if (!broker.isOnline) return

  let diskUsed = 0
  let cpuLoad = 0
  const leading: number[] = []
  const following: number[] = []

  topics.forEach(topic => {
    topic.partitions.forEach(partition => {
      if (partition.leaderId === broker.config.id) {
        leading.push(partition.id)
        diskUsed += partition.bytesUsed
        cpuLoad += partition.messages.length * 0.001
      } else if (partition.replicaIds.includes(broker.config.id)) {
        following.push(partition.id)
        diskUsed += partition.bytesUsed * 0.8
      }
    })
  })

  broker.diskUsedBytes = diskUsed
  broker.cpuPercent = Math.min(100, cpuLoad)
  broker.partitionsLeading = leading
  broker.partitionsFollowing = following
}

export function takeBrokerOffline(
  brokerId: BrokerId,
  brokers: Map<BrokerId, BrokerState>,
  topics: Map<string, TopicState>,
): void {
  const broker = brokers.get(brokerId)
  if (!broker) return
  broker.isOnline = false

  // remove from ISR and elect new leaders for affected partitions
  topics.forEach(topic => {
    topic.partitions.forEach(partition => {
      // remove from ISR
      partition.isrIds = partition.isrIds.filter(id => id !== brokerId)

      // elect new leader if needed
      if (partition.leaderId === brokerId) {
        const newLeader = partition.isrIds.find(id => {
          const b = brokers.get(id)
          return b?.isOnline
        })
        if (newLeader !== undefined) {
          partition.leaderId = newLeader
        }
      }
    })
  })

  // reassign controller if needed
  if (broker.isController) {
    broker.isController = false
    const newController = Array.from(brokers.values()).find(b => b.isOnline && b.config.id !== brokerId)
    if (newController) newController.isController = true
  }
}

export function bringBrokerOnline(
  brokerId: BrokerId,
  brokers: Map<BrokerId, BrokerState>,
  topics: Map<string, TopicState>,
): void {
  const broker = brokers.get(brokerId)
  if (!broker) return
  broker.isOnline = true

  // re-add to ISR for replica partitions
  topics.forEach(topic => {
    topic.partitions.forEach(partition => {
      if (partition.replicaIds.includes(brokerId) && !partition.isrIds.includes(brokerId)) {
        partition.isrIds.push(brokerId)
      }
    })
  })
}

export function countUnderReplicatedPartitions(topics: Map<string, TopicState>): number {
  let count = 0
  topics.forEach(topic => {
    topic.partitions.forEach(partition => {
      if (partition.isrIds.length < topic.config.replicationFactor) count++
    })
  })
  return count
}
