import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-topic-routing',
  index: 4,
  title: 'Wildcard Routing Failure',
  subtitle: 'Easy · Topic Exchange Wildcards',
  difficulty: 'easy',
  estimatedMinutes: 8,
  coverConcepts: ['topic-exchange', 'wildcard-routing', 'routing-key-pattern'],

  briefing: {
    story:
      "LogAggregator collects application errors from multiple environments. The routing key format is 'logs.{service}.{environment}.{level}' — e.g. 'logs.app.production.error'. The error queue binding uses pattern 'logs.*.error', expecting to catch all errors. But production error logs are never appearing in the error queue — only staging errors make it through.",
    symptom:
      "Pattern 'logs.*.error' only matches keys with exactly ONE word between 'logs' and 'error'. Keys like 'logs.app.production.error' have TWO words in the middle, so they don't match. Production errors are silently dropped.",
    goal:
      "Fix the binding pattern from 'logs.*.error' to 'logs.#.error' to use the multi-word wildcard. Error rate should drop below 1% and health above 85.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "In RabbitMQ topic exchange patterns: '*' matches exactly ONE dot-separated word. '#' matches zero or more words. 'logs.*.error' only matches 'logs.X.error' (3 parts) but not 'logs.X.Y.error' (4 parts).",
        relatedConcept: 'wildcard-routing',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Change the error queue binding from 'logs.*.error' to 'logs.#.error'. The '#' wildcard will match any number of intermediate routing key segments.",
        relatedConcept: 'topic-exchange',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 4096, minDiskFreeMb: 500, maxConnections: 1000 }],
    exchanges: [
      { name: 'logs', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'logs.error',
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
        name: 'logs.all',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 500000,
        messageTtlMs: 3600000,  // 1hr TTL
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: true,
      },
    ],
    bindings: [
      // WRONG: '*' only matches exactly one word segment
      { exchange: 'logs', queue: 'logs.error', routingKey: 'logs.*.error' },
      // Catch-all for archival
      { exchange: 'logs', queue: 'logs.all', routingKey: 'logs.#' },
    ],
    publishers: [
      {
        id: 'publisher-staging',
        targetExchange: 'logs',
        routingKey: 'logs.app.error',  // 3-part key — matches logs.*.error
        messagesPerSecond: 50,
        messageSizeBytes: 512,
        confirmMode: false,
        persistent: false,
      },
      {
        id: 'publisher-production',
        targetExchange: 'logs',
        routingKey: 'logs.app.production.error',  // 4-part key — does NOT match logs.*.error
        messagesPerSecond: 500,
        messageSizeBytes: 1024,
        confirmMode: true,
        persistent: true,
      },
      {
        id: 'publisher-info',
        targetExchange: 'logs',
        routingKey: 'logs.app.production.info',
        messagesPerSecond: 2000,
        messageSizeBytes: 256,
        confirmMode: false,
        persistent: false,
      },
    ],
    consumers: [
      {
        id: 'consumer-error-handler',
        queue: 'logs.error',
        prefetchCount: 200,
        ackMode: 'auto',
        processingTimeMs: 2,
        errorRate: 0,
      },
      {
        id: 'consumer-archive',
        queue: 'logs.all',
        prefetchCount: 500,
        ackMode: 'auto',
        processingTimeMs: 1,
        errorRate: 0,
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
      concept: 'topic-exchange',
      title: 'Topic Exchange Wildcards',
      body: "Topic exchanges use dot-separated routing keys with two wildcard characters: '*' (star) matches exactly ONE word between dots. '#' (hash) matches zero or more words. 'logs.*.error' matches 'logs.app.error' but NOT 'logs.app.prod.error'. 'logs.#.error' matches both. Always use '#' when the key depth is variable.",
      showWhenFixed: true,
    },
    {
      concept: 'routing-key-pattern',
      title: 'Designing Routing Key Hierarchies',
      body: "A well-designed routing key is hierarchical, from most general to most specific: 'domain.service.environment.level'. This allows flexible routing patterns. '#' can match the entire hierarchy. Topic exchanges are ideal when you need both broadcast-style (logs.#) and targeted routing (logs.*.production.error).",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'add-binding',
    'remove-binding',
    'set-routing-key',
  ],
}

export default scenario
