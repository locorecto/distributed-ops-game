import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-03-shopping-cart',
  index: 3,
  title: 'Shopping Cart Hash Operations',
  subtitle: 'Easy · Data Structures',
  difficulty: 'easy',
  estimatedMinutes: 12,
  coverConcepts: ['hash', 'HSET', 'HGET', 'partial update', 'serialization cost'],
  briefing: {
    story:
      'The e-commerce cart service stores each shopping cart as a single Redis String containing a serialized JSON blob. Every time a user adds, removes, or updates an item, the entire cart JSON is read, deserialized, modified, re-serialized, and written back. With 10,000 concurrent shoppers, write contention has caused latency to spike. Abandoned carts are up 40%.',
    symptom:
      'Average write latency is above 50ms. The application servers are CPU-saturated from constant JSON serialization. Redis write throughput is being wasted on full-blob rewrites for single-item changes.',
    goal:
      'Switch cart storage to Redis Hash (HSET cart:<userId> <sku> <quantity>). Each cart item becomes a hash field — individual items can be updated atomically without reading the whole cart. Reduce average latency below 5ms and error rate below 1%.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 50,
        text: 'Storing structured data as a JSON String means every update is a full read-modify-write cycle.',
        relatedConcept: 'serialization cost',
      },
      {
        order: 2,
        triggerOnHealthBelow: 35,
        text: 'Use HSET cart:<userId> <sku> <qty> to update a single item. HGET/HGETALL to read individual items or the full cart.',
        relatedConcept: 'HSET',
      },
      {
        order: 3,
        triggerOnHealthBelow: 20,
        text: 'Hash fields support HINCRBY for atomic quantity increments — no read-modify-write needed.',
        relatedConcept: 'hash',
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
        maxClients: 5000,
      },
    ],
    clients: [
      {
        id: 'client-cart-service',
        targetNode: 'redis-master',
        opsPerSecond: 5000,
        readRatio: 0.4,
        keyPattern: 'random',
        valueSize: 'medium',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'memory-pressure', target: 'redis-master', params: { dataStructure: 'string-blob' } },
  ],
  victoryConditions: [
    {
      id: 'low-latency',
      description: 'Average latency below 5ms',
      required: true,
      check: s => s.metrics.avgLatencyMs < 5,
    },
    {
      id: 'low-error-rate',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
  ],
  conceptCards: [
    {
      concept: 'hash',
      title: 'Redis Hash',
      body: 'A Redis Hash stores field-value pairs under a single key. HSET is O(1) per field. It is ideal for objects with many attributes where partial updates are common. Hashes also use less memory than equivalent String keys when there are fewer than 128 fields and values are small.',
      showWhenFixed: true,
    },
    {
      concept: 'partial update',
      title: 'Partial Updates with Hashes',
      body: 'Unlike Strings (which require full read-modify-write), Hash fields can be updated independently. HINCRBY atomically increments a field. HDEL removes a field. This eliminates the serialization overhead of JSON blob patterns.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['change-data-structure', 'set-eviction-policy'],
}

export default scenario
