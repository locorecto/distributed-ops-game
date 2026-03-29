import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-08-inventory-atomic',
  index: 8,
  title: 'Inventory Race Condition',
  subtitle: 'Medium · Transactions',
  difficulty: 'medium',
  estimatedMinutes: 20,
  coverConcepts: ['WATCH', 'MULTI', 'EXEC', 'optimistic locking', 'DECR', 'race condition', 'overselling'],
  briefing: {
    story:
      'Your e-commerce platform decrements inventory counts using a simple GET → check → DECR pattern. During a flash sale, two requests arrive simultaneously for the last unit of a product: both GET the value "1", both check that it\'s > 0, both DECR — resulting in an inventory count of -1. You have now sold 200 items you don\'t have in stock. Fulfilment is in chaos.',
    symptom:
      'Inventory counts are going negative on hot products. The oversell rate is 15% during peak traffic. Error rate from fulfillment service is climbing because orders cannot be completed.',
    goal:
      'Implement optimistic locking using WATCH/MULTI/EXEC: WATCH the inventory key before GET. If another client changes the key before EXEC, the transaction is aborted and retried. Alternatively, use a Lua script for atomic check-and-decrement. Reduce error rate below 1% and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 55,
        text: 'GET → check → DECR is not atomic. Another client can modify the key between your GET and DECR.',
        relatedConcept: 'race condition',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'Use WATCH inventory:<sku> before GET. Then MULTI → DECR → EXEC. If EXEC returns nil, another client changed the key — retry the whole transaction.',
        relatedConcept: 'WATCH',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'A Lua script is simpler: EVAL "if redis.call(\'GET\', KEYS[1]) > 0 then return redis.call(\'DECR\', KEYS[1]) else return -1 end" 1 inventory:<sku>',
        relatedConcept: 'optimistic locking',
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
        evictionPolicy: 'noeviction',
        persistenceMode: 'aof',
        appendfsync: 'always',
        maxClients: 2000,
      },
    ],
    clients: [
      {
        id: 'client-checkout-service',
        targetNode: 'redis-master',
        opsPerSecond: 3000,
        readRatio: 0.3,
        keyPattern: 'hot-key',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 10, type: 'hot-key', target: 'redis-master', params: { reason: 'flash-sale' } },
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
      concept: 'WATCH',
      title: 'WATCH / MULTI / EXEC — Optimistic Locking',
      body: 'WATCH marks keys for observation. MULTI starts a transaction block. EXEC executes the block atomically — but only if the WATCHed keys were not modified by another client. If they were, EXEC returns nil (transaction aborted). Retry until success. This is optimistic locking: no blocking, just retry on conflict.',
      showWhenFixed: true,
    },
    {
      concept: 'optimistic locking',
      title: 'Optimistic vs Pessimistic Locking',
      body: 'Pessimistic locking acquires a lock before reading, blocking others. Optimistic locking reads without a lock and checks for conflict before writing. Redis WATCH is optimistic. Use Lua scripts for the simplest atomic check-and-set pattern without the retry loop overhead.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['enable-watch-transaction', 'enable-lua-script', 'set-persistence-mode'],
}

export default scenario
