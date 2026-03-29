import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-24-large-value',
  index: 24,
  title: 'Large Value Memory Fragmentation',
  subtitle: 'Hard · Memory Optimization',
  difficulty: 'hard',
  estimatedMinutes: 30,
  coverConcepts: ['memory fragmentation', 'large values', 'jemalloc', 'value compression', 'OBJECT ENCODING', 'maxmemory'],
  briefing: {
    story:
      'A session service stores full user profiles as Redis Strings — JSON blobs ranging from 5MB to 10MB per session. Memory fragmentation ratio has reached 3.2x: Redis reports 10GB of actual data but 32GB of allocated memory. The OS is OOM-killing the Redis process. The fragmentation is caused by jemalloc\'s slab allocator struggling with variable-length large allocations: freed slabs cannot be reused for different-sized objects.',
    symptom:
      'Memory usage ratio is above 95% of available RAM. The fragmentation ratio is 3.2x (32GB allocated for 10GB of data). Redis is being OOM-killed by the OS. Sessions stored > 1MB are causing severe fragmentation in jemalloc.',
    goal:
      'Compress session JSON before storing (gzip reduces typical JSON by 70–90%). Split large objects into Hash fields (max 512KB per field). Set maxmemory to 60% of available RAM to leave headroom for fragmentation. Reduce memory usage below 70% and system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'Large variable-length values (1MB-10MB) cause severe memory fragmentation in Redis\'s jemalloc allocator. Freed slabs can\'t be compacted.',
        relatedConcept: 'memory fragmentation',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Compress values before storing. Gzip a 10MB JSON blob → ~500KB. Use OBJECT ENCODING to check current encodings. Store compressed bytes as String.',
        relatedConcept: 'value compression',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'Split large objects into Hash fields: HSET session:<id> profile_part1 <chunk1> profile_part2 <chunk2>. Smaller, uniform-size allocations fragment less. Also set maxmemory to 60% of total RAM.',
        relatedConcept: 'large values',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 16384,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
    ],
    clients: [
      {
        id: 'client-session-service',
        targetNode: 'redis-master',
        opsPerSecond: 1000,
        readRatio: 0.6,
        keyPattern: 'random',
        valueSize: 'large',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'memory-pressure', target: 'redis-master', params: { fragmentationRatio: 3.2, reason: 'large-values' } },
  ],
  victoryConditions: [
    {
      id: 'low-memory',
      description: 'Memory usage below 70%',
      required: true,
      check: s => s.metrics.memoryUsageRatio < 0.7,
    },
    {
      id: 'healthy-system',
      description: 'System health above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],
  conceptCards: [
    {
      concept: 'memory fragmentation',
      title: 'Memory Fragmentation in Redis',
      body: 'Redis uses jemalloc for memory allocation. When values of varying large sizes are freed and reallocated, jemalloc cannot reuse slabs efficiently, causing fragmentation. The mem_fragmentation_ratio in INFO memory shows allocated/used_memory. Above 1.5x is concerning; above 2x is problematic. MEMORY PURGE can reclaim fragmented memory at the cost of latency.',
      showWhenFixed: true,
    },
    {
      concept: 'value compression',
      title: 'Value Compression Strategies',
      body: 'Compress large values client-side before storing: zlib, gzip, lz4, or snappy. LZ4 offers the best speed/ratio for JSON. A 10MB JSON blob typically compresses to 300–800KB. This reduces both memory usage and network bandwidth. Decompress on read. Ensure clients agree on the compression codec.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['enable-value-compression', 'set-max-memory', 'split-large-values'],
}

export default scenario
