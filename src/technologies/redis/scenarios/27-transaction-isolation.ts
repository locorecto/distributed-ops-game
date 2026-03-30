import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-27-transaction-isolation',
  index: 27,
  title: 'Transaction Isolation Failure',
  subtitle: 'Expert · Transactions',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['MULTI/EXEC', 'WATCH', 'optimistic locking', 'retry storm', 'exponential backoff', 'contention', 'transaction abort'],
  briefing: {
    story:
      'A banking application uses WATCH/MULTI/EXEC to transfer funds between accounts. Under normal load, transactions succeed on the first try. During a promotion, 10,000 users simultaneously transfer from the same high-activity shared savings account. WATCH detects concurrent modification 40% of the time, aborting those transactions. The retry logic immediately retries with no backoff — creating a retry storm. 4,000 aborted clients retry simultaneously, causing even more collisions and 80% abort rate.',
    symptom:
      'Transaction abort (WATCH invalidation) rate is 40–80%. Error rate is growing. The system is in a positive feedback loop: aborted transactions retry immediately → more contention → more aborts → more retries. Redis CPU is saturating from the retry storm.',
    goal:
      'Implement exponential backoff with jitter in the retry loop (base: 10ms, max: 1s, jitter: ±50%). Consider partitioning the shared account into sub-accounts to reduce contention. Reduce error rate below 5%, latency below 100ms.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'When EXEC returns nil (WATCH invalidation), retrying immediately creates a thundering herd. All aborted clients retry at the same millisecond.',
        relatedConcept: 'retry storm',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Add exponential backoff: wait = min(base * 2^attempt + random(0, base), maxWait). This spreads retries across time, reducing simultaneous contention.',
        relatedConcept: 'exponential backoff',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'Partition the hot account: store balance as balance:0 through balance:9. Each transfer picks a random shard. Reduces per-shard contention by 10x. Periodically reconcile shard totals.',
        relatedConcept: 'contention',
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
        persistenceMode: 'aof',
        appendfsync: 'always',
        maxClients: 5000,
      },
    ],
    clients: [
      {
        id: 'client-banking-app',
        targetNode: 'redis-master',
        opsPerSecond: 10000,
        readRatio: 0.3,
        keyPattern: 'hot-key',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'race-condition', target: 'redis-master', params: { reason: 'watch-contention', abortRate: 0.4 } },
  ],
  victoryConditions: [
    {
      id: 'low-error-rate',
      description: 'Error rate below 5%',
      required: true,
      check: s => s.metrics.errorRate < 0.05,
    },
    {
      id: 'low-latency',
      description: 'Average latency below 100ms',
      required: true,
      check: s => s.metrics.avgLatencyMs < 100,
    },
  ],
  conceptCards: [
    {
      concept: 'MULTI/EXEC',
      title: 'MULTI/EXEC Transactions',
      body: 'MULTI starts a transaction block. Commands are queued (not executed) and return QUEUED. EXEC atomically executes all queued commands. DISCARD cancels the queue. If WATCH keys were modified before EXEC, EXEC returns nil (transaction aborted) — not an error. Your code must check for nil and retry.',
      showWhenFixed: true,
    },
    {
      concept: 'exponential backoff',
      title: 'Exponential Backoff with Jitter',
      body: 'Pure exponential backoff (wait = base × 2^n) synchronizes retriers: all clients back off to the same interval. Adding jitter (randomness) desynchronizes them. Full jitter: wait = random(0, base × 2^n). Equal jitter: wait = base × 2^n/2 + random(0, base × 2^n/2). AWS recommends "decorrelated jitter" for best results.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['add-retry-backoff', 'partition-hot-key', 'enable-lua-script'],
}

export default scenario
