import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-manual-ack',
  index: 8,
  title: 'Lost Payment Messages',
  subtitle: 'Medium · Auto-Ack vs Manual Ack',
  difficulty: 'medium',
  estimatedMinutes: 10,
  coverConcepts: ['auto-ack', 'manual-ack', 'message-durability', 'at-least-once-delivery'],

  briefing: {
    story:
      "PaySecure's payment processing service is in auto-ack mode. When the consumer receives a payment message, RabbitMQ marks it acknowledged immediately — before the consumer finishes processing. During a broker restart, 5,000 in-flight payments were lost because auto-ack had already removed them from the queue. Customers are being charged but payments aren't recorded.",
    symptom:
      "Messages acknowledged on receipt, not on successful processing. Consumer crashes mid-transaction → messages lost. During the broker restart, all messages that were 'in-flight' (received but not processed) vanished. No redelivery possible.",
    goal:
      'Switch the consumer from auto-ack to manual ack. Messages should only be acknowledged after successful processing. Unacked messages should stay below 100 and health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 75,
        text: "Auto-ack mode tells RabbitMQ: 'I've received it, mark it done' — before the consumer even starts processing. If the consumer crashes, the message is permanently lost. Switch to manual ack mode.",
        relatedConcept: 'auto-ack',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "With manual ack, the consumer must explicitly call basic.ack after successful processing. Set ackMode='manual' and ensure errorRate is low. Messages in progress stay 'unacked' in RabbitMQ — if the consumer dies, they're redelivered.",
        relatedConcept: 'manual-ack',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 4096, minDiskFreeMb: 500, maxConnections: 1000 }],
    exchanges: [
      { name: 'payments', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'payments.processing',
        type: 'quorum',  // Quorum queue for durability
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 100000,
        messageTtlMs: null,
        deadLetterExchange: 'dlx',
        deadLetterRoutingKey: 'payments.processing',
        maxPriority: null,
        lazyMode: false,
      },
      {
        name: 'payments.dlq',
        type: 'quorum',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 50000,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
    ],
    bindings: [
      { exchange: 'payments', queue: 'payments.processing', routingKey: 'payment' },
      { exchange: 'dlx', queue: 'payments.dlq', routingKey: 'payments.processing' },
    ],
    publishers: [
      {
        id: 'publisher-checkout',
        targetExchange: 'payments',
        routingKey: 'payment',
        messagesPerSecond: 200,
        messageSizeBytes: 512,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-payment-processor',
        queue: 'payments.processing',
        prefetchCount: 50,
        ackMode: 'auto',  // BUG: auto-ack loses messages on crash
        processingTimeMs: 20,
        errorRate: 0.02,
      },
    ],
  },

  failureScript: [
    // Simulate a consumer crash at tick 15 while processing payments
    { atTick: 15, type: 'consumer-crash', target: 'consumer-payment-processor', params: {} },
  ],

  victoryConditions: [
    {
      id: 'unacked-low',
      description: 'Unacked messages below 100',
      required: true,
      check: s => s.metrics.totalMessagesUnacked < 100,
    },
    {
      id: 'health-good',
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'auto-ack',
      title: 'Auto-Ack: Fire and Forget',
      body: "In auto-ack mode (basic.consume with no-ack=true), RabbitMQ considers a message delivered the moment it's sent to the consumer over TCP. The message is removed from the queue immediately. If the consumer crashes before processing, the message is permanently lost. Never use auto-ack for important data like payments, orders, or financial records.",
      showWhenFixed: true,
    },
    {
      concept: 'manual-ack',
      title: 'Manual Ack: At-Least-Once Delivery',
      body: "Manual ack requires the consumer to call basic.ack(deliveryTag) after successfully processing a message. Until then, the message stays 'unacked' in RabbitMQ. If the consumer disconnects, all unacked messages are requeued. This guarantees at-least-once delivery — your processing logic should be idempotent to handle potential redelivery.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-ack-mode',
    'set-prefetch-count',
    'restart-consumer',
  ],
}

export default scenario
