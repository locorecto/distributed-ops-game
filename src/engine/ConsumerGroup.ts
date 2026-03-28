import type {
  ConsumerGroupState, ConsumerState, TopicState,
  GroupId, ConsumerId, PartitionKey,
} from './types'
import { roundRobinAssign } from '../utils/partitionAssignment'
import { GAME } from '../constants/game'

export function createConsumerGroupState(
  groupId: GroupId,
  coordinatorBrokerId: number,
): ConsumerGroupState {
  return {
    groupId,
    members: [],
    partitionAssignment: new Map(),
    state: 'empty',
    rebalanceCount: 0,
    rebalancingTicksLeft: 0,
    coordinatorBrokerId,
    missedMessages: 0,
  }
}

export function triggerRebalance(group: ConsumerGroupState): void {
  group.state = 'rebalancing'
  group.rebalancingTicksLeft = GAME.REBALANCE_TICKS
  group.rebalanceCount++
}

export function tickRebalance(
  group: ConsumerGroupState,
  consumers: Map<ConsumerId, ConsumerState>,
  topics: Map<string, TopicState>,
): void {
  if (group.state !== 'rebalancing') return

  group.rebalancingTicksLeft--
  if (group.rebalancingTicksLeft > 0) return

  // rebalance complete — reassign partitions
  const activeMembers = group.members.filter(id => {
    const c = consumers.get(id)
    return c?.isActive
  })

  if (activeMembers.length === 0) {
    group.state = 'empty'
    group.partitionAssignment.clear()
    return
  }

  // collect all topic-partitions for this group
  const allTPs: { topic: string; partition: number }[] = []
  const subscribedTopics = new Set<string>()
  for (const mid of activeMembers) {
    const c = consumers.get(mid)
    if (!c) continue
    for (const t of c.config.subscribedTopics) subscribedTopics.add(t)
  }

  subscribedTopics.forEach(topicName => {
    const topic = topics.get(topicName)
    if (!topic) return
    topic.partitions.forEach((_, pid) => allTPs.push({ topic: topicName, partition: pid }))
  })

  const assignment = roundRobinAssign(allTPs, activeMembers)

  group.partitionAssignment.clear()
  assignment.forEach((tps, consumerId) => {
    // update consumer's assigned partitions
    const consumer = consumers.get(consumerId)
    if (consumer) {
      consumer.assignedPartitions.clear()
      for (const tp of tps) {
        const key: PartitionKey = `${tp.topic}:${tp.partition}`
        group.partitionAssignment.set(key, consumerId)
        if (!consumer.assignedPartitions.has(tp.topic)) {
          consumer.assignedPartitions.set(tp.topic, [])
        }
        consumer.assignedPartitions.get(tp.topic)!.push(tp.partition)
      }
    }
  })

  group.state = 'stable'
}

export function addMember(
  group: ConsumerGroupState,
  consumerId: ConsumerId,
): void {
  if (!group.members.includes(consumerId)) {
    group.members.push(consumerId)
    triggerRebalance(group)
  }
}

export function removeMember(
  group: ConsumerGroupState,
  consumerId: ConsumerId,
): void {
  const idx = group.members.indexOf(consumerId)
  if (idx !== -1) {
    group.members.splice(idx, 1)
    triggerRebalance(group)
  }
}
