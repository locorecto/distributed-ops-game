import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-27-stream-offset',
  index: 27,
  title: 'Stream Consumer Offset Replay',
  subtitle: 'Expert · Stream Offset Specs',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['stream-offset-spec', 'first/last/timestamp/offset', 'consumer-groups', 'offset-tracking', 'reprocessing'],

  briefing: {
    story:
      "After a bug in the fraud detection service misclassified 50,000 transactions over 3 days, you need to replay exactly those messages from the RabbitMQ Stream. The stream retains 7 days of data. But the consumer is configured with `offset: last` — it will only receive new messages, not historical ones. You need to replay from a specific timestamp (3 days ago) to now.",
    symptom:
      "The fraud detection consumer is configured with x-stream-offset: last — it only receives messages published after it connects. To replay the 3 days of misclassified transactions, you need to start consuming from a specific timestamp (2026-03-25T00:00:00Z). The existing consumer subscription cannot be changed in-place; a new consumer with the correct offset must be created.",
    goal:
      'Create a dedicated replay consumer with offset spec set to the timestamp 3 days ago (2026-03-25T00:00:00Z), process all 50,000 misclassified transactions through a corrected version of the fraud detection logic, track progress with a named offset, and verify reprocessing completes without re-triggering production alerts.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Create a new consumer with x-stream-offset set to a timestamp: in AMQP, pass x-stream-offset as a message timestamp type with the value 2026-03-25T00:00:00Z (Unix timestamp: 1742860800000). This tells RabbitMQ to start delivering from the first message at or after that point in time.",
        relatedConcept: 'stream-offset-spec',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "Use a separate consumer name for the replay consumer (e.g. 'fraud-replay-2026-03-25') so it gets its own server-side offset tracking. This prevents the replay from affecting the production consumer's stored offset position.",
        relatedConcept: 'offset-tracking',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "Once the replay consumer reaches the 'now' offset (the message published at replay start time), stop it — don't let it overlap with the live production consumer. Use application-side logic to detect when the replay has caught up: compare the message timestamp to the replay start time.",
        relatedConcept: 'reprocessing',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node-1', maxMemoryMb: 32768, minDiskFreeMb: 20480, maxConnections: 1000 },
      { id: 'rabbit@node-2', maxMemoryMb: 32768, minDiskFreeMb: 20480, maxConnections: 1000 },
      { id: 'rabbit@node-3', maxMemoryMb: 32768, minDiskFreeMb: 20480, maxConnections: 1000 },
    ],
    exchanges: [
      { name: 'transactions', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'transactions.stream',
        type: 'stream',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: null,
        messageTtlMs: 604800000,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
    ],
    bindings: [
      { exchange: 'transactions', queue: 'transactions.stream', routingKey: 'txn' },
    ],
    publishers: [
      {
        id: 'publisher-payment-gateway',
        targetExchange: 'transactions',
        routingKey: 'txn',
        messagesPerSecond: 2000,
        messageSizeBytes: 1024,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-fraud-detection',
        queue: 'transactions.stream',
        prefetchCount: 500,
        ackMode: 'auto',
        processingTimeMs: 3,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'consumer-wrong-offset', target: 'consumer-fraud-detection', params: { offsetSpec: 'last', requiredOffsetSpec: 'timestamp', requiredTimestamp: 1742860800000, misclassifiedMessages: 50000 } },
    { atTick: 2, type: 'reprocessing-needed', target: 'transactions.stream', params: { fromTimestamp: 1742860800000, messageCount: 50000 } },
  ],

  victoryConditions: [
    {
      id: 'replay-consumer-created',
      description: 'Replay consumer created with correct timestamp offset',
      required: true,
      check: s => !s.activeFailures.includes('consumer-wrong-offset'),
    },
    {
      id: 'reprocessing-complete',
      description: 'All 50,000 transactions reprocessed',
      required: true,
      check: s => !s.activeFailures.includes('reprocessing-needed'),
    },
    {
      id: 'production-unaffected',
      description: 'Production consumer still processing live messages',
      required: true,
      check: s => s.metrics.totalConsumeRate > 1800,
    },
  ],

  conceptCards: [
    {
      concept: 'stream-offset-spec',
      title: 'Stream Offset Specifications',
      body: "RabbitMQ Streams support five offset specs for consumer positioning: 'first' (replay entire stream from start), 'last' (only new messages from now), 'next' (same as last, skip current tail), a numeric byte offset, or a timestamp (start from the first message at or after a given time). Timestamp offsets use Unix epoch milliseconds and enable precise point-in-time replay.",
      showWhenFixed: true,
    },
    {
      concept: 'offset-tracking',
      title: 'Server-Side Offset Tracking',
      body: "RabbitMQ Streams can store consumer offsets server-side by consumer name. When a consumer reconnects with the same name, it automatically resumes from its last stored offset. For replay consumers, use a unique name to get independent offset tracking. Call basic.ack periodically (or use x-stream-offset-tracking) to persist progress, enabling resume on failure.",
      showWhenFixed: false,
    },
    {
      concept: 'reprocessing',
      title: 'Safe Stream Reprocessing Patterns',
      body: "When reprocessing historical stream data, isolate the replay consumer from production by: using a unique consumer name, routing reprocessed results to a staging topic/queue, validating results before promoting to production, and setting a hard stop offset (the timestamp when replay started) to prevent overlap with live data. Never replay using the same consumer name as production.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-offset-to-timestamp',
    'track-consumer-offset',
    'create-dedicated-replay-consumer',
  ],
}

export default scenario
