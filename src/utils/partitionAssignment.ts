/**
 * Round-robin partition assignment: distribute partitions across consumers as evenly as possible.
 */
export function roundRobinAssign(
  topicPartitions: { topic: string; partition: number }[],
  consumerIds: string[],
): Map<string, { topic: string; partition: number }[]> {
  const result = new Map<string, { topic: string; partition: number }[]>()
  for (const cid of consumerIds) result.set(cid, [])

  if (consumerIds.length === 0) return result

  topicPartitions.forEach((tp, i) => {
    const cid = consumerIds[i % consumerIds.length]
    result.get(cid)!.push(tp)
  })
  return result
}
