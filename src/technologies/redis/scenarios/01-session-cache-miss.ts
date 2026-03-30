import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-01-session-cache-miss',
  index: 1,
  title: 'Session Cache Miss Storm',
  subtitle: 'Beginner · TTL & Cache Expiry',
  difficulty: 'beginner',
  estimatedMinutes: 10,
  coverConcepts: ['TTL', 'cache expiry', 'thundering herd', 'jitter'],
  briefing: {
    story:
      'Your login service stores user sessions in Redis with a 30-minute TTL. During last night\'s deployment, a misconfigured environment variable changed the TTL to 60 seconds instead of 1800 seconds. All sessions are now expiring every minute, forcing every user to re-authenticate continuously. Server error rates have spiked to 90% and the support queue is flooded.',
    symptom:
      'Cache hit rate has dropped to near 0%. Error rate is above 90%. Every request is a cache miss, slamming the authentication database with redundant queries.',
    goal:
      'Restore the TTL to 1800 seconds and implement expiry jitter (±10%) so sessions do not all expire simultaneously. Achieve error rate < 5% and cache hit rate > 80%.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 40,
        text: 'Check the TTL configuration. A TTL of 60s on session keys means every user must re-authenticate every minute.',
        relatedConcept: 'TTL',
      },
      {
        order: 2,
        triggerOnHealthBelow: 25,
        text: 'Use SET key value EX 1800 to restore a 30-minute session TTL.',
        relatedConcept: 'TTL',
      },
      {
        order: 3,
        triggerOnHealthBelow: 15,
        text: 'Add jitter: randomize TTL between 1620–1980s (±10%) so sessions expire gradually instead of all at once.',
        relatedConcept: 'jitter',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 512,
        evictionPolicy: 'volatile-lru',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 1000,
      },
    ],
    clients: [
      {
        id: 'client-login-service',
        targetNode: 'redis-master',
        opsPerSecond: 2000,
        readRatio: 0.9,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 10, type: 'ttl-expiry', target: 'redis-master', params: { ttlSeconds: 60 } },
  ],
  victoryConditions: [
    {
      id: 'low-error-rate',
      description: 'Error rate below 5%',
      required: true,
      check: s => s.metrics.errorRate < 0.05,
    },
    {
      id: 'high-hit-rate',
      description: 'Cache hit rate above 80%',
      required: true,
      check: s => s.metrics.cacheHitRate > 0.8,
    },
  ],
  conceptCards: [
    {
      concept: 'TTL',
      title: 'Time-To-Live (TTL)',
      body: 'Redis TTL controls how long a key lives before automatic expiry. Setting TTL too short causes cache miss storms when many keys expire simultaneously. Always add random jitter (±10–20%) to spread expiry across time.',
      showWhenFixed: true,
    },
    {
      concept: 'jitter',
      title: 'Expiry Jitter',
      body: 'Jitter randomises the TTL of each key within a range. For a 30-minute session, use TTL = 1800 + random(-180, 180). This prevents the thundering herd problem where all sessions expire at the same instant.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['set-ttl', 'set-eviction-policy'],
}

export default scenario
