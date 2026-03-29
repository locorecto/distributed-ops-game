import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-message-ttl',
  index: 5,
  title: 'Expiring Notifications',
  subtitle: 'Medium · Message TTL & DLX',
  difficulty: 'medium',
  estimatedMinutes: 10,
  coverConcepts: ['message-ttl', 'dead-letter-exchange', 'expiry', 'notification-pipeline'],

  briefing: {
    story:
      "PushNow's mobile notification service is failing silently. Push notifications for time-sensitive promotions are expiring before they're delivered. Someone set x-message-ttl to 1000ms (1 second) on the notification queue thinking it was 1000 seconds. The consumer processes ~300 messages/sec but 90% expire before they reach a device.",
    symptom:
      "90% of push notifications expire in the queue after just 1 second. The consumer processes surviving messages, but most are long-dead promotions. No DLX is configured so expired messages vanish — no visibility into the loss.",
    goal:
      'Increase message TTL to 3,600,000ms (1 hour) to give the consumer enough time. Add a DLX to capture expired messages for analytics. Bring error rate below 5% and system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "The 'notifications' queue has x-message-ttl=1000ms — messages expire after just 1 second. With a consumer processing 300/s against 500/s inflow, queue depth grows and messages expire before delivery. Increase TTL to at least 3600000ms (1 hour).",
        relatedConcept: 'message-ttl',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Also add a Dead Letter Exchange to capture expired messages. Create a 'notifications.expired' queue bound to a 'dlx' exchange, then set deadLetterExchange='dlx' on the main notifications queue.",
        relatedConcept: 'dead-letter-exchange',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 4096, minDiskFreeMb: 500, maxConnections: 1000 }],
    exchanges: [
      { name: 'notifications', type: 'direct', durable: true, autoDelete: false },
      { name: 'dlx', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'notifications.push',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 100000,
        messageTtlMs: 1000,  // BUG: 1 second, should be 3600000 (1 hour)
        deadLetterExchange: null,  // No DLX configured
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
      {
        name: 'notifications.expired',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 500000,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: true,
      },
    ],
    bindings: [
      { exchange: 'notifications', queue: 'notifications.push', routingKey: 'push' },
      { exchange: 'dlx', queue: 'notifications.expired', routingKey: 'notifications.push' },
    ],
    publishers: [
      {
        id: 'publisher-promotions',
        targetExchange: 'notifications',
        routingKey: 'push',
        messagesPerSecond: 500,
        messageSizeBytes: 256,
        confirmMode: false,
        persistent: false,
      },
    ],
    consumers: [
      {
        id: 'consumer-push-sender',
        queue: 'notifications.push',
        prefetchCount: 100,
        ackMode: 'auto',
        processingTimeMs: 3,  // ~333 msg/s — slower than publish rate
        errorRate: 0.05,
      },
    ],
  },

  failureScript: [
    // Simulate a burst of notifications at tick 10
    { atTick: 10, type: 'publisher-flood', target: 'publisher-promotions', params: { rate: 2000 } },
    { atTick: 30, type: 'publisher-flood', target: 'publisher-promotions', params: { rate: 500 } },
  ],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 5%',
      required: true,
      check: s => s.metrics.errorRate < 0.05,
    },
    {
      id: 'health-good',
      description: 'System health above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'message-ttl',
      title: 'Message TTL (Time-To-Live)',
      body: "x-message-ttl sets how long a message can sit in a queue before expiring (in milliseconds). When a message expires, it's either discarded or routed to a Dead Letter Exchange. TTL is useful for time-sensitive data (promotions, real-time prices) but must be set appropriately for your consumer throughput. Too short a TTL with a slow consumer = most messages never delivered.",
      showWhenFixed: true,
    },
    {
      concept: 'dead-letter-exchange',
      title: 'DLX for Expired Messages',
      body: "Configuring a Dead Letter Exchange on a queue ensures expired or rejected messages don't vanish silently. Expired messages retain their original headers plus x-death metadata (reason, queue, count). Route them to an analysis queue to understand message loss patterns and tune your TTL settings.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-message-ttl',
    'set-dead-letter-exchange',
    'add-queue',
    'add-binding',
  ],
}

export default scenario
