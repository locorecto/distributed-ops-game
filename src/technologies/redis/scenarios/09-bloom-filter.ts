import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-09-bloom-filter',
  index: 9,
  title: 'Bloom Filter Fraud Detection',
  subtitle: 'Medium · Probabilistic Data Structures',
  difficulty: 'medium',
  estimatedMinutes: 20,
  coverConcepts: ['bloom filter', 'RedisBloom', 'probabilistic data structure', 'false positive', 'memory efficiency', 'BF.ADD', 'BF.EXISTS'],
  briefing: {
    story:
      'Your fraud detection service checks every payment transaction against a blacklist of 1 billion known-fraudulent card numbers. The blacklist is stored as a Redis Set. At 8 bytes per entry × 1 billion entries = 8GB — but Redis overheads push actual memory to 50GB. The instance is running out of memory and the ops team is refusing to provision more RAM.',
    symptom:
      'Memory usage ratio is at 98%. The Redis instance is near OOM. SADD is failing intermittently. Fraud checks are being skipped when Redis is unavailable, allowing fraudulent transactions through.',
    goal:
      'Replace the full Set with a RedisBloom Bloom Filter (BF.ADD / BF.EXISTS). A Bloom filter can represent 1 billion entries with a 0.1% false positive rate in under 2GB — a 96% memory reduction. Accept the 0.1% false positive rate (legitimate cards occasionally blocked — recoverable). Reduce memory usage below 60% and error rate below 2%.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 55,
        text: 'A Redis Set stores every element exactly. For billions of entries, memory cost is prohibitive. Consider probabilistic alternatives.',
        relatedConcept: 'memory efficiency',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'A Bloom filter uses bit arrays and multiple hash functions. BF.ADD adds an item; BF.EXISTS checks membership. Never false-negatives, rare false-positives.',
        relatedConcept: 'bloom filter',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'BF.RESERVE blacklist 0.001 1000000000 creates a Bloom filter with 0.1% false positive rate for 1B items. Memory: ~1.7GB vs 50GB for a Set.',
        relatedConcept: 'RedisBloom',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 4096,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 1000,
      },
    ],
    clients: [
      {
        id: 'client-fraud-checker',
        targetNode: 'redis-master',
        opsPerSecond: 20000,
        readRatio: 0.95,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'memory-pressure', target: 'redis-master', params: { reason: 'set-overload', gbUsed: 50 } },
  ],
  victoryConditions: [
    {
      id: 'low-memory',
      description: 'Memory usage below 60%',
      required: true,
      check: s => s.metrics.memoryUsageRatio < 0.6,
    },
    {
      id: 'low-error-rate',
      description: 'Error rate below 2%',
      required: true,
      check: s => s.metrics.errorRate < 0.02,
    },
  ],
  conceptCards: [
    {
      concept: 'bloom filter',
      title: 'Bloom Filter',
      body: 'A Bloom filter is a space-efficient probabilistic data structure that tests set membership. It may have false positives (says an item is present when it is not) but never false negatives. The false positive rate is tunable — lower rate = more memory. Ideal for existence checks on large datasets.',
      showWhenFixed: true,
    },
    {
      concept: 'probabilistic data structure',
      title: 'Probabilistic Data Structures in Redis',
      body: 'RedisBloom adds: Bloom Filters (set membership), Cuckoo Filters (deletable membership), Count-Min Sketch (frequency estimation), HyperLogLog (cardinality estimation), Top-K (heavy hitters). All trade small accuracy loss for massive memory savings.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['enable-bloom-filter', 'set-max-memory', 'set-eviction-policy'],
}

export default scenario
