import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-queue-overflow',
  index: 1,
  title: 'Queue Overflow Crisis',
  subtitle: 'Beginner · Queue Depth & Max-Length',
  difficulty: 'beginner',
  estimatedMinutes: 5,
  coverConcepts: ['queue-depth', 'max-length', 'dead-letter-exchange', 'flow-control'],

  briefing: {
    story:
      "ShopFast's order processing system is in meltdown. The checkout service publishes 10,000 orders per second but the fulfillment consumer can only process 1,000/s. The queue has no length limit — it just keeps growing. The RabbitMQ node is running out of memory and is about to crash.",
    symptom:
      'Queue depth is climbing by 9,000 messages every second. Memory alarm will trigger soon, blocking all publishers and freezing the entire system.',
    goal:
      'Set a max-length of 10,000 on the orders queue and add a Dead Letter Exchange to capture overflow messages. Reduce total messages ready below 50,000 and restore system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "The orders queue has no max-length. Set it to 10000 to cap the depth. When the queue is full, new messages will be rejected and can be routed to a DLX for later analysis.",
        relatedConcept: 'max-length',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Create a 'orders-overflow' queue and bind it to the 'dlx' exchange with routing key 'orders'. Then set deadLetterExchange='dlx' on the main orders queue.",
        relatedConcept: 'dead-letter-exchange',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 2048, minDiskFreeMb: 500, maxConnections: 1000 }],
    exchanges: [
      { name: 'orders', type: 'direct', durable: true, autoDelete: false },
      { name: 'dlx', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'orders.fulfillment',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: null,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
    ],
    bindings: [
      { exchange: 'orders', queue: 'orders.fulfillment', routingKey: 'order.created' },
    ],
    publishers: [
      {
        id: 'publisher-checkout',
        targetExchange: 'orders',
        routingKey: 'order.created',
        messagesPerSecond: 10000,
        messageSizeBytes: 512,
        confirmMode: false,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-fulfillment',
        queue: 'orders.fulfillment',
        prefetchCount: 100,
        ackMode: 'manual',
        processingTimeMs: 1,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    // Queue starts growing immediately — no failure needed, just imbalanced rates
    // At tick 10, simulate a consumer slowdown to make things worse
    { atTick: 10, type: 'consumer-slow', target: 'consumer-fulfillment', params: { processingTimeMs: 2 } },
  ],

  victoryConditions: [
    {
      id: 'queue-depth-low',
      description: 'Total messages ready below 50,000',
      required: true,
      check: s => s.metrics.totalMessagesReady < 50_000,
    },
    {
      id: 'health-good',
      description: 'System health score above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'max-length',
      title: 'Queue Max Length',
      body: "Setting x-max-length on a RabbitMQ queue caps its depth. When full, new messages are either dropped or routed to a Dead Letter Exchange (DLX). Without a limit, a fast publisher can fill all available memory, triggering a memory alarm that blocks ALL publishers on the broker — not just the offending one.",
      showWhenFixed: true,
    },
    {
      concept: 'dead-letter-exchange',
      title: 'Dead Letter Exchange (DLX)',
      body: "A DLX catches messages that are rejected, expired, or overflow a max-length queue. Instead of silently dropping messages, you route them to a separate queue for investigation. Always pair max-length with a DLX in production systems.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-queue-max-length',
    'set-dead-letter-exchange',
    'add-queue',
    'add-binding',
    'set-publisher-rate',
    'add-consumer',
  ],
}

export default scenario
