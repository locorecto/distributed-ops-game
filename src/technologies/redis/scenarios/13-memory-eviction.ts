import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-13-memory-eviction',
  index: 13,
  title: 'Memory Eviction Crisis',
  subtitle: 'Medium-Hard · Memory Management',
  difficulty: 'medium-hard',
  estimatedMinutes: 22,
  coverConcepts: ['maxmemory', 'eviction policy', 'allkeys-lru', 'allkeys-lfu', 'noeviction', 'OOM', 'LRU', 'LFU'],
  briefing: {
    story:
      'Your application uses Redis as a pure cache — no persistent data. Someone set maxmemory-policy=noeviction "to be safe." Redis memory is now at 100%. Every new write returns: "OOM command not allowed when used memory > maxmemory." The entire application is down. Writes are failing, sessions cannot be created, the site is returning 500 errors.',
    symptom:
      'Memory usage is at 100%. All write operations return OOM errors. Error rate is 100% for write operations. The application is completely non-functional. noeviction means Redis refuses new writes instead of evicting old data.',
    goal:
      'Change maxmemory-policy to allkeys-lru or allkeys-lfu to enable automatic eviction of least-recently-used keys when memory is full. Since this is a cache, no data is critical. Reduce error rate below 2% and memory usage below 85%.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'maxmemory-policy=noeviction means Redis refuses writes when memory is full. For a cache, this is almost always the wrong policy.',
        relatedConcept: 'noeviction',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'allkeys-lru evicts the least-recently-used key across all keys when memory is full. Safe for caches where all keys are equivalent in importance.',
        relatedConcept: 'allkeys-lru',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'allkeys-lfu (Redis 4.0+) evicts the least-frequently-used key. Better for workloads with hot keys that should be retained. Use volatile-lru/volatile-lfu if only keys with TTL should be eligible for eviction.',
        relatedConcept: 'allkeys-lfu',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 1024,
        evictionPolicy: 'noeviction',
        persistenceMode: 'none',
        appendfsync: 'no',
        maxClients: 1000,
      },
    ],
    clients: [
      {
        id: 'client-cache-users',
        targetNode: 'redis-master',
        opsPerSecond: 8000,
        readRatio: 0.5,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'memory-pressure', target: 'redis-master', params: { fillToMax: true } },
  ],
  victoryConditions: [
    {
      id: 'low-error-rate',
      description: 'Error rate below 2%',
      required: true,
      check: s => s.metrics.errorRate < 0.02,
    },
    {
      id: 'memory-manageable',
      description: 'Memory usage below 85%',
      required: true,
      check: s => s.metrics.memoryUsageRatio < 0.85,
    },
  ],
  conceptCards: [
    {
      concept: 'eviction policy',
      title: 'Redis Eviction Policies',
      body: 'noeviction: refuse writes when full (use for persistent data). volatile-lru/lfu/random: evict keys with TTL only. allkeys-lru/lfu/random: evict any key. volatile-ttl: evict keys closest to expiry. For pure caches, use allkeys-lru or allkeys-lfu. For mixed workloads, use volatile-lru to protect persistent keys.',
      showWhenFixed: true,
    },
    {
      concept: 'LFU',
      title: 'LRU vs LFU Eviction',
      body: 'LRU (Least Recently Used) evicts the key not accessed for the longest time. LFU (Least Frequently Used) evicts the key accessed the fewest times. LFU better retains hot keys that are accessed frequently but not recently. Redis LFU uses a logarithmic counter with decay — tunable with lfu-decay-time.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['set-eviction-policy', 'set-max-memory', 'flush-cache'],
}

export default scenario
