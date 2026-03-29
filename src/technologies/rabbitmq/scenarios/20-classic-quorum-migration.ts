import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-20-migration',
  index: 20,
  title: 'Classic → Quorum Migration',
  subtitle: 'Hard · Queue Type Migration',
  difficulty: 'hard',
  estimatedMinutes: 30,
  coverConcepts: ['queue-type-migration', 'quorum-queues', 'blue-green-migration', 'consumer-drain', 'policy-override'],

  briefing: {
    story:
      "You must migrate 20 production classic mirrored queues to quorum queues for better consistency guarantees. RabbitMQ doesn't support in-place queue type conversion. Consumer applications are spread across 8 services. You need a zero-message-loss migration plan during a 2-hour maintenance window.",
    symptom:
      "The current classic mirrored queues use ha-mode:all with manual sync, creating risk of data loss on node failures. Management has approved a 2-hour window to migrate to quorum queues. However, simply deleting and recreating queues as quorum type would lose all in-flight messages. There is no ALTER QUEUE command in RabbitMQ.",
    goal:
      'Execute a blue-green queue migration: create new quorum queues, drain existing classic queues, switch consumer bindings to the new queues, and verify zero message loss. Complete migration within the maintenance window.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Step 1: Create new quorum queues with the same names suffixed '-quorum' (e.g. orders.processing-quorum). Bind them to the same exchanges with the same routing keys. Do NOT delete the classic queues yet.",
        relatedConcept: 'blue-green-migration',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "Step 2: Drain the classic queues. Stop publishing new messages to the classic queues (redirect publishers to the new quorum queues). Wait for existing classic queue depth to reach 0 — all in-flight messages are processed.",
        relatedConcept: 'consumer-drain',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "Step 3: Switch consumer bindings. Update all 8 consumer services to consume from the new quorum queues. Remove the old bindings from the classic queues. Once consumers are confirmed on quorum queues, delete the now-empty classic queues.",
        relatedConcept: 'queue-type-migration',
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
      { name: 'orders', type: 'direct', durable: true, autoDelete: false },
      { name: 'payments', type: 'direct', durable: true, autoDelete: false },
      { name: 'inventory', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'orders.processing',
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
      {
        name: 'payments.processing',
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
      {
        name: 'inventory.updates',
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
      { exchange: 'orders', queue: 'orders.processing', routingKey: 'order.#' },
      { exchange: 'payments', queue: 'payments.processing', routingKey: 'payment.#' },
      { exchange: 'inventory', queue: 'inventory.updates', routingKey: 'inventory.#' },
    ],
    publishers: [
      {
        id: 'publisher-order-service',
        targetExchange: 'orders',
        routingKey: 'order.created',
        messagesPerSecond: 500,
        messageSizeBytes: 1024,
        confirmMode: true,
        persistent: true,
      },
      {
        id: 'publisher-payment-service',
        targetExchange: 'payments',
        routingKey: 'payment.completed',
        messagesPerSecond: 200,
        messageSizeBytes: 512,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-order-processor',
        queue: 'orders.processing',
        prefetchCount: 100,
        ackMode: 'manual',
        processingTimeMs: 10,
        errorRate: 0,
      },
      {
        id: 'consumer-payment-processor',
        queue: 'payments.processing',
        prefetchCount: 50,
        ackMode: 'manual',
        processingTimeMs: 15,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'migration-required', target: 'orders.processing', params: { reason: 'classic-mirrored-deprecated', targetType: 'quorum' } },
    { atTick: 1, type: 'migration-required', target: 'payments.processing', params: { reason: 'classic-mirrored-deprecated', targetType: 'quorum' } },
  ],

  victoryConditions: [
    {
      id: 'all-queues-quorum',
      description: 'All queues are quorum type',
      required: true,
      check: s => {
        for (const [, q] of s.queues) {
          if (q.config.type !== 'quorum') return false
        }
        return true
      },
    },
    {
      id: 'no-message-loss',
      description: 'No messages lost during migration',
      required: true,
      check: s => s.metrics.errorRate < 0.001,
    },
    {
      id: 'consumers-active',
      description: 'All consumers processing on quorum queues',
      required: true,
      check: s => s.metrics.totalConsumeRate > 600,
    },
  ],

  conceptCards: [
    {
      concept: 'blue-green-migration',
      title: 'Blue-Green Queue Migration',
      body: "RabbitMQ has no in-place queue type conversion. To migrate from classic to quorum queues safely, use a blue-green approach: create new quorum queues (green) alongside the existing classic queues (blue), redirect publishers to green, drain blue to zero, then switch consumers to green and delete blue. This achieves zero message loss at the cost of temporarily running dual queues.",
      showWhenFixed: true,
    },
    {
      concept: 'consumer-drain',
      title: 'Consumer Drain',
      body: "Draining a queue means stopping new publishes while existing consumers continue processing until the queue depth reaches zero. In a blue-green migration, you drain the old (blue) queue by pointing publishers at the new (green) queue, then waiting for depth to hit zero before switching consumers. Monitor queue depth via the management UI or rabbitmqctl list_queues.",
      showWhenFixed: false,
    },
    {
      concept: 'policy-override',
      title: 'Policy-Based Migration',
      body: "Policies can be used to manage migration settings at scale. Apply a policy to all 20 classic queues to add monitoring tags, then systematically work through them. Policy changes take effect immediately and can be scripted. For the quorum queue target, use x-queue-type: quorum in the queue declaration — this cannot be set via policy on an existing queue, only at declaration time.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'create-quorum-queue',
    'drain-classic-queue',
    'switch-consumer-bindings',
  ],
}

export default scenario
