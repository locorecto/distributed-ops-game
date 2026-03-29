import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-fanout-broadcast',
  index: 3,
  title: 'Incomplete Broadcast',
  subtitle: 'Easy · Fanout Exchange',
  difficulty: 'easy',
  estimatedMinutes: 7,
  coverConcepts: ['fanout-exchange', 'broadcast', 'exchange-type', 'binding'],

  briefing: {
    story:
      "EventStream publishes user activity events that need to be consumed by 5 different downstream services: analytics, audit, recommendations, search indexer, and real-time dashboard. Currently the system uses a direct exchange with 5 separate publishers, each publishing to a specific queue. Any new service added misses all historical messages, and the publisher code has to be updated every time a new consumer joins.",
    symptom:
      "New services miss events because they require a new binding AND publisher update. The search-indexer queue was recently added but its binding to the direct exchange uses a different routing key — it receives zero events.",
    goal:
      'Replace the direct exchange with a fanout exchange. Bind all 5 queues to it. All queues should receive every event without any routing key configuration. Restore system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "A fanout exchange ignores routing keys and delivers every message to ALL bound queues simultaneously. Switch the 'events' exchange type from 'direct' to 'fanout'.",
        relatedConcept: 'fanout-exchange',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "After changing to fanout, rebind all 5 queues. The routing key in fanout bindings is ignored — use '' or '#' as a placeholder. All queues will now receive every event automatically.",
        relatedConcept: 'binding',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 8192, minDiskFreeMb: 500, maxConnections: 2000 }],
    exchanges: [
      { name: 'user-events', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'events.analytics',
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
        name: 'events.audit',
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
        name: 'events.recommendations',
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
        name: 'events.search',
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
        name: 'events.dashboard',
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
    ],
    bindings: [
      // Only 4 of 5 queues are bound, and with mismatched routing keys for direct exchange
      { exchange: 'user-events', queue: 'events.analytics', routingKey: 'user.event' },
      { exchange: 'user-events', queue: 'events.audit', routingKey: 'user.event' },
      { exchange: 'user-events', queue: 'events.recommendations', routingKey: 'user.event' },
      { exchange: 'user-events', queue: 'events.dashboard', routingKey: 'user.event' },
      // events.search is bound but with wrong routing key — won't receive messages
      { exchange: 'user-events', queue: 'events.search', routingKey: 'user.activity' },
    ],
    publishers: [
      {
        id: 'publisher-activity',
        targetExchange: 'user-events',
        routingKey: 'user.event',
        messagesPerSecond: 2000,
        messageSizeBytes: 256,
        confirmMode: false,
        persistent: false,
      },
    ],
    consumers: [
      { id: 'consumer-analytics', queue: 'events.analytics', prefetchCount: 100, ackMode: 'auto', processingTimeMs: 1, errorRate: 0 },
      { id: 'consumer-audit', queue: 'events.audit', prefetchCount: 100, ackMode: 'auto', processingTimeMs: 1, errorRate: 0 },
      { id: 'consumer-recommendations', queue: 'events.recommendations', prefetchCount: 100, ackMode: 'auto', processingTimeMs: 2, errorRate: 0 },
      { id: 'consumer-search', queue: 'events.search', prefetchCount: 100, ackMode: 'auto', processingTimeMs: 3, errorRate: 0 },
      { id: 'consumer-dashboard', queue: 'events.dashboard', prefetchCount: 100, ackMode: 'auto', processingTimeMs: 1, errorRate: 0 },
    ],
  },

  failureScript: [
    // At tick 5, the search queue starts filling up since consumer gets nothing to process
    // This is baked into the wrong routing key scenario above
  ],

  victoryConditions: [
    {
      id: 'health-good',
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
    {
      id: 'search-queue-receiving',
      description: 'Search queue receiving events (depth > 0 or dequeue rate > 0)',
      required: true,
      check: s => {
        const sq = s.queues.get('events.search')
        return sq !== undefined && (sq.enqueueRate > 0 || sq.dequeueRate > 0 || sq.depth > 0)
      },
    },
  ],

  conceptCards: [
    {
      concept: 'fanout-exchange',
      title: 'Fanout Exchange',
      body: "A fanout exchange delivers every message to ALL bound queues, ignoring routing keys entirely. It's the broadcast mechanism of RabbitMQ — perfect for event-driven architectures where multiple services need the same data. Adding a new consumer is as simple as creating a new queue and binding it to the fanout exchange.",
      showWhenFixed: true,
    },
    {
      concept: 'exchange-type',
      title: 'Choosing the Right Exchange Type',
      body: "Use direct for point-to-point routing with exact key matching. Use topic for pattern-based routing (wildcards). Use fanout for broadcasting to all subscribers. Use headers for routing based on message attributes instead of routing keys. Picking the wrong type is a common source of misrouting bugs.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'change-exchange-type',
    'add-binding',
    'remove-binding',
  ],
}

export default scenario
