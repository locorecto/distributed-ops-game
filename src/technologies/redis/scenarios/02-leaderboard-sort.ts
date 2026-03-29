import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-02-leaderboard-sort',
  index: 2,
  title: 'Leaderboard Sorted Set',
  subtitle: 'Easy · Data Structures',
  difficulty: 'easy',
  estimatedMinutes: 12,
  coverConcepts: ['sorted set', 'ZADD', 'ZRANGE', 'O(log n)', 'data structure selection'],
  briefing: {
    story:
      'Your mobile game has 1 million registered players. The leaderboard service was built quickly using a Redis List: scores are appended with RPUSH and the entire list is fetched and sorted in application code for every page view. The leaderboard page now takes 8 seconds to load. Players are rage-quitting.',
    symptom:
      'Average latency is above 8000ms for leaderboard queries. The app server is CPU-bound sorting a 1M-element list on every request. Redis CPU is low — all the waste is in the wrong data structure.',
    goal:
      'Switch the leaderboard to a Redis Sorted Set (ZADD to add scores, ZRANGE/ZREVRANGE to fetch top-N). Sorted Sets maintain order automatically in O(log n). Reduce average latency below 10ms and system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 50,
        text: 'A Redis List has O(n) cost for sorted retrieval. For ranked data, use a Sorted Set instead.',
        relatedConcept: 'sorted set',
      },
      {
        order: 2,
        triggerOnHealthBelow: 35,
        text: 'Use ZADD leaderboard <score> <player> to add. Use ZREVRANGE leaderboard 0 99 to get the top 100.',
        relatedConcept: 'ZADD',
      },
      {
        order: 3,
        triggerOnHealthBelow: 20,
        text: 'ZRANGE and ZREVRANGE are O(log n + m) where m is the result size — orders of magnitude faster than sorting a List.',
        relatedConcept: 'O(log n)',
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
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
    ],
    clients: [
      {
        id: 'client-leaderboard',
        targetNode: 'redis-master',
        opsPerSecond: 500,
        readRatio: 0.95,
        keyPattern: 'sequential',
        valueSize: 'large',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'memory-pressure', target: 'redis-master', params: { dataStructure: 'list' } },
  ],
  victoryConditions: [
    {
      id: 'low-latency',
      description: 'Average latency below 10ms',
      required: true,
      check: s => s.metrics.avgLatencyMs < 10,
    },
    {
      id: 'healthy-system',
      description: 'System health score above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],
  conceptCards: [
    {
      concept: 'sorted set',
      title: 'Redis Sorted Set (ZSET)',
      body: 'Sorted Sets store members with floating-point scores, maintaining order automatically using a skip list. ZADD is O(log n). ZRANGE/ZREVRANGE with a rank range is O(log n + m). Perfect for leaderboards, priority queues, and time-series indices.',
      showWhenFixed: true,
    },
    {
      concept: 'data structure selection',
      title: 'Choosing the Right Redis Data Structure',
      body: 'List: ordered insertion, O(n) search. Set: unique membership, O(1) lookup. Sorted Set: scored ranking, O(log n) range. Hash: field-value pairs, O(1) per field. Choosing the wrong structure is one of the most common Redis performance mistakes.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['change-data-structure', 'rebuild-index'],
}

export default scenario
