import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-21-redlock',
  index: 21,
  title: 'Redlock Race Condition',
  subtitle: 'Hard · Distributed Locking',
  difficulty: 'hard',
  estimatedMinutes: 35,
  coverConcepts: ['Redlock', 'distributed lock', 'TTL', 'GC pause', 'fencing token', 'lock expiry', 'clock drift'],
  briefing: {
    story:
      'A distributed cron job uses Redlock across 3 independent Redis nodes with a lock TTL of 100ms. A Java worker acquires the lock and starts processing. A GC stop-the-world pause of 150ms occurs mid-processing. By the time the worker resumes, its lock has expired and another worker has acquired the same lock. Both workers are now running simultaneously, corrupting a shared report file. Duplicate charges have been processed. Finance is furious.',
    symptom:
      'Error rate reflects duplicate processing. Shared resources are being corrupted. Lock acquisition succeeds for two clients simultaneously because GC pauses exceed the lock TTL. The short TTL was chosen to "release locks quickly" but is dangerously short for JVM workloads.',
    goal:
      'Increase lock TTL to 30 seconds to outlast GC pauses. Implement fencing tokens (INCR-based monotonic counter): the lock holder includes its token in all storage writes, and storage rejects lower-numbered tokens. Add exponential backoff on lock retry. Reduce error rate below 1% and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'Lock TTL of 100ms is shorter than a typical JVM GC pause (50–500ms). When GC runs, the lock expires and another worker grabs it.',
        relatedConcept: 'GC pause',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Increase TTL to 30,000ms. Set TTL = max_expected_operation_time × 10. A lock that outlasts the operation is safe; one that expires during it is dangerous.',
        relatedConcept: 'TTL',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'Fencing tokens: use INCR to generate a monotonic counter on lock acquisition. Pass the token to every downstream write. Storage layers reject writes with a lower token than the last seen — evicting stale lock holders.',
        relatedConcept: 'fencing token',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-node-1',
        role: 'master',
        maxMemoryMb: 512,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 500,
      },
      {
        id: 'redis-node-2',
        role: 'master',
        maxMemoryMb: 512,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 500,
      },
      {
        id: 'redis-node-3',
        role: 'master',
        maxMemoryMb: 512,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 500,
      },
    ],
    clients: [
      {
        id: 'client-cron-worker-1',
        targetNode: 'redis-node-1',
        opsPerSecond: 100,
        readRatio: 0.5,
        keyPattern: 'hot-key',
        valueSize: 'small',
      },
      {
        id: 'client-cron-worker-2',
        targetNode: 'redis-node-1',
        opsPerSecond: 100,
        readRatio: 0.5,
        keyPattern: 'hot-key',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 15, type: 'hot-key', target: 'redis-node-1', params: { reason: 'gc-pause', pauseMs: 150, lockTtlMs: 100 } },
  ],
  victoryConditions: [
    {
      id: 'low-error-rate',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
    {
      id: 'healthy-system',
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],
  conceptCards: [
    {
      concept: 'Redlock',
      title: 'Redlock Algorithm',
      body: 'Redlock acquires a lock on N independent Redis nodes. A lock is valid if acquired on more than N/2 nodes within a validity time window (TTL minus acquisition time). It provides stronger safety than single-node locks but is still vulnerable to GC pauses and clock drift. Use fencing tokens for critical sections.',
      showWhenFixed: true,
    },
    {
      concept: 'fencing token',
      title: 'Fencing Tokens',
      body: 'A fencing token is a monotonically increasing number issued with each lock acquisition. The lock holder sends the token with every storage write. Storage rejects writes with a token lower than the highest seen. This prevents stale lock holders from making changes even after their lock expired, regardless of GC pauses or network delays.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['increase-lock-ttl', 'enable-fencing-tokens', 'add-retry-backoff'],
}

export default scenario
