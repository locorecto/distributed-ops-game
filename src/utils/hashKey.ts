/**
 * Simplified murmur2-style hash for routing message keys to partitions.
 * Matches Kafka's default partitioner behaviour: same key always → same partition.
 */
export function hashKey(key: string, partitionCount: number): number {
  let hash = 0x9747b28c
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x5bd1e995)
    hash ^= hash >>> 15
  }
  hash = Math.imul(hash, 0x5bd1e995)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0x5bd1e995)
  hash ^= hash >>> 15
  return Math.abs(hash) % partitionCount
}
