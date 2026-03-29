import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-direct-exchange',
  index: 2,
  title: 'Misrouted Orders',
  subtitle: 'Easy · Direct Exchange & Routing Keys',
  difficulty: 'easy',
  estimatedMinutes: 6,
  coverConcepts: ['direct-exchange', 'routing-key', 'binding', 'message-routing'],

  briefing: {
    story:
      "RetailCorp's e-commerce platform is sending order confirmation emails to customers — except they keep getting push notifications instead, and order emails are missing. A junior engineer fat-fingered the binding routing key when setting up the direct exchange. 'order.confirm' was typed as 'order.confirmed' in the binding. Now all order messages land in the notifications queue instead of the email queue.",
    symptom:
      "The email queue has zero depth — no messages are being delivered. The notifications queue is backed up with thousands of misrouted order confirmation messages. Error rate is high as the notification consumer rejects order-shaped messages.",
    goal:
      'Fix the binding routing key so order messages route to the correct email queue. Bring error rate below 1% and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Check the bindings on the 'orders' direct exchange. The email queue binding has routing key 'order.confirmed' — but the publisher sends messages with key 'order.confirm'. One character difference!",
        relatedConcept: 'routing-key',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Remove the incorrect binding (orders → email queue, key: 'order.confirmed') and add the correct one (orders → email queue, key: 'order.confirm'). Direct exchange requires an exact string match.",
        relatedConcept: 'direct-exchange',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 4096, minDiskFreeMb: 500, maxConnections: 1000 }],
    exchanges: [
      { name: 'orders', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'email.queue',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 100000,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
      {
        name: 'notifications.queue',
        type: 'classic',
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
      // WRONG: 'order.confirmed' instead of 'order.confirm'
      { exchange: 'orders', queue: 'email.queue', routingKey: 'order.confirmed' },
      { exchange: 'orders', queue: 'notifications.queue', routingKey: 'order.notify' },
    ],
    publishers: [
      {
        id: 'publisher-orders',
        targetExchange: 'orders',
        routingKey: 'order.confirm',
        messagesPerSecond: 500,
        messageSizeBytes: 256,
        confirmMode: true,
        persistent: true,
      },
      {
        id: 'publisher-notifications',
        targetExchange: 'orders',
        routingKey: 'order.notify',
        messagesPerSecond: 200,
        messageSizeBytes: 128,
        confirmMode: false,
        persistent: false,
      },
    ],
    consumers: [
      {
        id: 'consumer-email',
        queue: 'email.queue',
        prefetchCount: 50,
        ackMode: 'manual',
        processingTimeMs: 5,
        errorRate: 0,
      },
      {
        id: 'consumer-notifications',
        queue: 'notifications.queue',
        prefetchCount: 50,
        ackMode: 'auto',
        processingTimeMs: 2,
        errorRate: 0.9,  // Rejects order-shaped messages it receives by mistake
      },
    ],
  },

  failureScript: [],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
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
      concept: 'direct-exchange',
      title: 'Direct Exchange',
      body: "A direct exchange routes messages to queues whose binding key exactly matches the message's routing key. It's case-sensitive and requires a precise string match — 'order.confirm' ≠ 'order.confirmed'. Use direct exchanges when you know the exact destination of each message type.",
      showWhenFixed: true,
    },
    {
      concept: 'routing-key',
      title: 'Routing Keys',
      body: "The routing key is a string attribute set by the publisher on each message. The exchange uses it to decide which queues receive the message. For direct exchanges, the routing key must exactly match the binding key. Always document your routing key conventions to prevent typo-induced misrouting.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'add-binding',
    'remove-binding',
    'set-routing-key',
    'purge-queue',
  ],
}

export default scenario
