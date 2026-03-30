import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-07-cache-stampede',
  index: 7,
  title: 'Cache Stampede',
  subtitle: 'Medium · Cache Patterns',
  difficulty: 'medium',
  estimatedMinutes: 20,
  coverConcepts: ['cache stampede', 'thundering herd', 'mutex lock', 'SET NX PX', 'cache warming', 'dogpile'],
  briefing: {
    story:
      'Your product catalog caches expensive database queries in Redis with a 1-hour TTL. The catalog has 500 popular items. Every hour on the hour, all 500 cache entries expire simultaneously. At that moment, 500 concurrent requests all find cache misses and simultaneously query the database. The database is overwhelmed, response times jump to 30 seconds, and the DB crashes under the load. This happens every hour like clockwork.',
    symptom:
      'Latency spikes to 30,000ms every 60 minutes. Error rate spikes to 80% for 2–3 minutes per hour. The database CPU hits 100% at expiry time. Cache hit rate drops to 0% for the burst window.',
    goal:
      'Implement a mutex lock pattern using SET NX PX: only one request rebuilds the cache while others wait. Add cache warming to pre-populate keys before they expire. Reduce error rate below 2%, latency below 50ms, and system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 55,
        text: 'All 500 keys expire at the exact same second. This is the thundering herd — hundreds of concurrent cache misses hitting the DB simultaneously.',
        relatedConcept: 'cache stampede',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'Use SET lock:<key> 1 NX PX 5000 to acquire a mutex before rebuilding. Only the request that acquires the lock queries the DB. Others wait and retry from cache.',
        relatedConcept: 'mutex lock',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'Add jitter to the TTL (±10 minutes) so keys expire gradually. Or use a background cache warmer that refreshes keys 5 minutes before expiry.',
        relatedConcept: 'cache warming',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 2048,
        evictionPolicy: 'volatile-lru',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 3000,
      },
    ],
    clients: [
      {
        id: 'client-product-service',
        targetNode: 'redis-master',
        opsPerSecond: 5000,
        readRatio: 0.95,
        keyPattern: 'uniform',
        valueSize: 'medium',
      },
    ],
  },
  failureScript: [
    { atTick: 20, type: 'eviction-storm', target: 'redis-master', params: { reason: 'mass-expiry' } },
    { atTick: 21, type: 'hot-key', target: 'redis-master', params: {} },
  ],
  victoryConditions: [
    {
      id: 'low-error-rate',
      description: 'Error rate below 2%',
      required: true,
      check: s => s.metrics.errorRate < 0.02,
    },
    {
      id: 'low-latency',
      description: 'Average latency below 50ms',
      required: true,
      check: s => s.metrics.avgLatencyMs < 50,
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
      concept: 'cache stampede',
      title: 'Cache Stampede (Dogpile Effect)',
      body: 'A cache stampede occurs when many concurrent requests simultaneously find the same cache entry missing and all attempt to rebuild it. This collapses the backend. Solutions: mutex locks, probabilistic early expiration, background refresh, or staggered TTLs with jitter.',
      showWhenFixed: true,
    },
    {
      concept: 'mutex lock',
      title: 'Mutex Lock with SET NX',
      body: 'SET key value NX PX ttlMs sets a key only if it does not exist (NX) with a TTL in milliseconds (PX). This is an atomic distributed lock. The first caller gets the lock; others see the key exists and wait. Always set a TTL so locks do not persist if the holder crashes.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['enable-mutex-lock', 'set-ttl', 'enable-cache-warming'],
}

export default scenario
