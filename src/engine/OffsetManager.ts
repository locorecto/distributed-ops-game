import type { ConsumerState, PartitionKey, Offset } from './types'

export function getCommittedOffset(state: ConsumerState, key: PartitionKey): Offset {
  return state.committedOffsets.get(key) ?? -1
}

export function getCurrentOffset(state: ConsumerState, key: PartitionKey): Offset {
  return state.currentOffsets.get(key) ?? -1
}

export function advanceCurrentOffset(state: ConsumerState, key: PartitionKey, to: Offset): void {
  state.currentOffsets.set(key, to)
}

export function commitOffset(state: ConsumerState, key: PartitionKey, offset: Offset): void {
  state.committedOffsets.set(key, offset)
}

export function commitAll(state: ConsumerState): void {
  state.currentOffsets.forEach((offset, key) => {
    state.committedOffsets.set(key, offset)
  })
}

export function autoCommitIfDue(state: ConsumerState, currentTick: number, tickRateMs: number): void {
  if (!state.config.enableAutoCommit) return
  const autoCommitIntervalTicks = state.config.autoCommitIntervalMs / tickRateMs
  if (currentTick % Math.max(1, autoCommitIntervalTicks) < 1) {
    commitAll(state)
  }
}

export function computeLag(
  state: ConsumerState,
  partitionEndOffsets: Map<PartitionKey, Offset>,
): number {
  let totalLag = 0
  state.assignedPartitions.forEach((partitionIds, topic) => {
    for (const partitionId of partitionIds) {
      const key: PartitionKey = `${topic}:${partitionId}`
      const endOffset = partitionEndOffsets.get(key) ?? 0
      const committed = getCommittedOffset(state, key)
      totalLag += Math.max(0, endOffset - (committed + 1))
    }
  })
  state.lag = totalLag
  return totalLag
}
