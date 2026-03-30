import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-04-rate-limiter',
  index: 4,
  title: 'Rate Limiter Breakdown',
  subtitle: 'Easy · Atomicity & Lua',
  difficulty: 'easy',
  estimatedMinutes: 15,
  coverConcepts: ['atomicity', 'INCR', 'EXPIRE', 'Lua script', 'SET NX', 'race condition', 'sliding window'],
  briefing: {
    story:
      'Your API rate limiter uses two separate commands: INCR to count requests and EXPIRE to set the window. Because these are not atomic, a race condition exists: two threads can both call INCR before either calls EXPIRE, and the expiry is never set. Users can make unlimited requests — you\'ve had a customer make 500,000 API calls in 10 minutes (limit: 1000/minute). Your bill from the downstream provider is catastrophic.',
    symptom:
      'Rate limiting is completely ineffective. Error rate from the downstream API is spiking due to quota exhaustion. Some keys have no TTL and will never expire, leaking memory.',
    goal:
      'Replace the INCR+EXPIRE race with an atomic operation: either a Lua script combining the check and increment, or SET key 1 EX 60 NX for fixed-window limiting. Reduce error rate below 2% and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 50,
        text: 'INCR and EXPIRE are two separate commands — they are not atomic. Another request can slip in between them.',
        relatedConcept: 'race condition',
      },
      {
        order: 2,
        triggerOnHealthBelow: 35,
        text: 'Use a Lua script: EVAL "local c = redis.call(\'INCR\', KEYS[1]); if c == 1 then redis.call(\'EXPIRE\', KEYS[1], 60) end; return c" 1 rate:<userId>',
        relatedConcept: 'Lua script',
      },
      {
        order: 3,
        triggerOnHealthBelow: 20,
        text: 'For a sliding window rate limiter, use a Sorted Set: ZADD with the current timestamp as score, ZREMRANGEBYSCORE to remove old entries, ZCARD to count.',
        relatedConcept: 'sliding window',
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
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
    ],
    clients: [
      {
        id: 'client-api-gateway',
        targetNode: 'redis-master',
        opsPerSecond: 10000,
        readRatio: 0.2,
        keyPattern: 'hot-key',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'race-condition', target: 'redis-master', params: { race: 'incr-expire' } },
  ],
  victoryConditions: [
    {
      id: 'low-error-rate',
      description: 'Error rate below 2%',
      required: true,
      check: s => s.metrics.errorRate < 0.02,
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
      concept: 'atomicity',
      title: 'Atomic Operations in Redis',
      body: 'Redis is single-threaded, so individual commands are atomic. But two separate commands are NOT atomic together — another client can execute between them. Use Lua scripts (executed atomically) or MULTI/EXEC transactions to group commands.',
      showWhenFixed: true,
    },
    {
      concept: 'sliding window',
      title: 'Sliding Window Rate Limiting',
      body: 'A fixed window resets at clock boundaries, allowing 2x the limit at the boundary. A sliding window tracks the exact last N seconds. Use a Sorted Set: score = timestamp, value = request ID. ZREMRANGEBYSCORE removes expired entries, ZCARD gives the current count.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['enable-lua-script', 'set-ttl', 'change-data-structure'],
}

export default scenario
