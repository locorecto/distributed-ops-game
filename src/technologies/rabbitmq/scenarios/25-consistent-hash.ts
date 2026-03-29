import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-25-consistent-hash',
  index: 25,
  title: 'Consistent Hash Hotspot',
  subtitle: 'Expert · Sharded Queues',
  difficulty: 'expert',
  estimatedMinutes: 35,
  coverConcepts: ['consistent-hash-exchange', 'sharded-queues', 'routing-key-distribution', 'hash-ring', 'consumer-scaling'],

  briefing: {
    story:
      "An order processing system uses a consistent hash exchange to distribute orders across 8 queues (shards). Due to a bug in the publisher, all orders for product IDs 1000-2000 use routing key \"1001\" (a hash collision with bucket 3). Queue-3 has 2M messages while queues 1-2 and 4-8 are empty. 7 out of 8 consumer workers are idle.",
    symptom:
      "Queue orders-shard-3 has 2,000,000 messages. Queues orders-shard-1, 2, 4, 5, 6, 7, 8 have 0 messages. Consumer workers assigned to shards 1, 2, 4-8 are idle. The publisher bug causes all product-ID-1000-2000 orders to use routing key '1001', which always hashes to bucket 3. The consistent hash ring has no load balancing for this traffic.",
    goal:
      'Fix the routing key distribution in the publisher (use actual product ID as routing key), rebalance hash weights to redistribute load, and add additional consumers to the hot shard temporarily. Restore even distribution across all 8 shards.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Fix the publisher bug: each order should use its actual product ID as the routing key, not the hardcoded '1001'. The consistent hash exchange will then distribute different product IDs across different shards based on their hash values.",
        relatedConcept: 'routing-key-distribution',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "To drain the existing 2M message backlog on shard-3 faster, temporarily add more consumers to the orders-shard-3 queue. Scaling consumers per-shard is possible because each shard is just a regular queue.",
        relatedConcept: 'consumer-scaling',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "Consider rebalancing hash weights. The consistent hash exchange assigns queues different weights (default 1 each). Temporarily increase the weight of shard-3 to 0 and redistribute to other queues — this redirects new traffic to less-loaded shards while shard-3 drains. Reset weights once load equalises.",
        relatedConcept: 'hash-ring',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node-1', maxMemoryMb: 16384, minDiskFreeMb: 4000, maxConnections: 2000 },
      { id: 'rabbit@node-2', maxMemoryMb: 16384, minDiskFreeMb: 4000, maxConnections: 2000 },
      { id: 'rabbit@node-3', maxMemoryMb: 16384, minDiskFreeMb: 4000, maxConnections: 2000 },
    ],
    exchanges: [
      { name: 'orders.hash', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => ({
        name: `orders-shard-${i}`,
        type: 'quorum' as const,
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: null,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      })),
    ],
    bindings: [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => ({
        exchange: 'orders.hash',
        queue: `orders-shard-${i}`,
        routingKey: '1',
      })),
    ],
    publishers: [
      {
        id: 'publisher-orders-buggy',
        targetExchange: 'orders.hash',
        routingKey: '1001',
        messagesPerSecond: 5000,
        messageSizeBytes: 1024,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => ({
        id: `consumer-shard-${i}`,
        queue: `orders-shard-${i}`,
        prefetchCount: 100,
        ackMode: 'manual' as const,
        processingTimeMs: 10,
        errorRate: 0,
      })),
    ],
  },

  failureScript: [
    { atTick: 1, type: 'routing-key-bug', target: 'publisher-orders-buggy', params: { fixedRoutingKey: '1001', affectedShard: 3, backlogMessages: 2000000 } },
    { atTick: 2, type: 'queue-hotspot', target: 'orders-shard-3', params: { depth: 2000000 } },
    { atTick: 2, type: 'idle-consumers', target: 'consumer-shard-1', params: {} },
    { atTick: 2, type: 'idle-consumers', target: 'consumer-shard-2', params: {} },
  ],

  victoryConditions: [
    {
      id: 'routing-fixed',
      description: 'Routing key distribution is even across shards',
      required: true,
      check: s => !s.activeFailures.includes('routing-key-bug'),
    },
    {
      id: 'shard-balanced',
      description: 'No single shard has more than 3x average queue depth',
      required: true,
      check: s => !s.activeFailures.includes('queue-hotspot'),
    },
    {
      id: 'all-consumers-active',
      description: 'All 8 shard consumers are processing messages',
      required: true,
      check: s => s.metrics.totalConsumeRate > 4000,
    },
  ],

  conceptCards: [
    {
      concept: 'consistent-hash-exchange',
      title: 'Consistent Hash Exchange',
      body: "The consistent hash exchange (rabbitmq_consistent_hash_exchange plugin) routes messages to queues by hashing the routing key (or a message header) and mapping the hash to a position on a virtual ring. Each bound queue occupies a segment of the ring proportional to its weight. This ensures messages with the same routing key always go to the same queue, enabling per-key ordering guarantees.",
      showWhenFixed: true,
    },
    {
      concept: 'routing-key-distribution',
      title: 'Routing Key Cardinality',
      body: "The consistent hash exchange distributes load evenly only if routing keys are well-distributed across the hash space. If all messages use a small set of routing keys (or a single key), all traffic lands on the same shard. High-cardinality routing keys (e.g. UUID order IDs, product IDs) produce good distribution. Low-cardinality keys (e.g. 'true'/'false', small enums) cause hotspots.",
      showWhenFixed: false,
    },
    {
      concept: 'hash-ring',
      title: 'Hash Ring and Weights',
      body: "Each queue bound to a consistent hash exchange has a weight (specified as the routing key in the binding, default '1'). A weight of '2' means the queue occupies twice the virtual ring space and receives roughly twice the traffic. Weights allow uneven shard sizing — useful when queues have different consumer capacity or when migrating between shard counts without rehashing everything.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'fix-routing-key-distribution',
    'rebalance-hash-weights',
    'add-consumers-to-hot-shard',
  ],
}

export default scenario
