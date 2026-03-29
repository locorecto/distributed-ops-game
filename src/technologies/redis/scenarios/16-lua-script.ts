import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-16-lua-script',
  index: 16,
  title: 'Lua Script Blocking',
  subtitle: 'Medium-Hard · Scripting',
  difficulty: 'medium-hard',
  estimatedMinutes: 25,
  coverConcepts: ['Lua script', 'event loop', 'blocking', 'EVALSHA', 'pipelining', 'MULTI/EXEC', 'script optimization'],
  briefing: {
    story:
      'A pricing engine uses a Lua script to perform conditional price calculations on a hot product key. The script iterates over 500 price rules stored in a Hash, computes discounts, and updates the price — all atomically. The script takes 50ms to execute. Since Redis executes Lua scripts atomically and single-threaded, every other command queues for 50ms while the script runs. With 2,000 requests/second hitting this key, P99 latency is 2,000ms across the entire instance.',
    symptom:
      'P99 latency is 2000ms across ALL Redis operations, not just pricing. Redis CPU is spiking to 100%. The slow Lua script blocks the event loop for every other key on the instance.',
    goal:
      'Optimize the Lua script to run in < 1ms, or replace it with a pipeline + WATCH transaction. Consider pre-computing prices and caching results. Reduce average latency below 10ms and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 55,
        text: 'Redis is single-threaded. A Lua script that takes 50ms blocks ALL other commands for 50ms. Long-running scripts are a cluster-wide problem.',
        relatedConcept: 'event loop',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'Reduce script complexity: pre-compute the price rules outside Redis, store a single computed price, and use a short atomic SET-if-unchanged instead of the full calculation script.',
        relatedConcept: 'script optimization',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'Alternatively, use pipelining: batch multiple READ commands, process in application, then pipeline the WRITEs with MULTI/EXEC. This keeps script execution time near zero.',
        relatedConcept: 'pipelining',
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
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 3000,
      },
    ],
    clients: [
      {
        id: 'client-pricing-engine',
        targetNode: 'redis-master',
        opsPerSecond: 2000,
        readRatio: 0.3,
        keyPattern: 'hot-key',
        valueSize: 'medium',
      },
      {
        id: 'client-other-services',
        targetNode: 'redis-master',
        opsPerSecond: 5000,
        readRatio: 0.8,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'hot-key', target: 'redis-master', params: { reason: 'lua-blocking', scriptMs: 50 } },
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
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],
  conceptCards: [
    {
      concept: 'Lua script',
      title: 'Lua Scripts and the Event Loop',
      body: 'Redis executes Lua scripts atomically in the single-threaded event loop. While a script runs, no other commands execute. Scripts must be short (< 1ms) and must not make network calls. Use SCRIPT KILL to terminate a hung script (unless it has already performed writes).',
      showWhenFixed: true,
    },
    {
      concept: 'EVALSHA',
      title: 'EVALSHA for Script Reuse',
      body: 'EVAL sends the full Lua script text on every call. EVALSHA sends a SHA1 hash of a pre-loaded script. Use SCRIPT LOAD to upload the script once, then EVALSHA for subsequent calls. This reduces network bandwidth and allows Redis to cache the compiled script.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['optimize-lua-script', 'enable-pipelining', 'enable-watch-transaction'],
}

export default scenario
