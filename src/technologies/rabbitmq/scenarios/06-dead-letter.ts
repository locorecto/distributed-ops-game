import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-dead-letter',
  index: 6,
  title: 'Poison Message Loop',
  subtitle: 'Medium · Nack Requeue & Dead Letter',
  difficulty: 'medium',
  estimatedMinutes: 10,
  coverConcepts: ['nack-requeue', 'dead-letter-exchange', 'poison-message', 'infinite-loop'],

  briefing: {
    story:
      "DataProcessor's validation service is in an infinite loop. A malformed message (invalid JSON schema) entered the 'validation' queue. The consumer tries to parse it, fails, and calls nack with requeue=true. RabbitMQ puts the message back at the front of the queue. The consumer picks it up again immediately. This repeats thousands of times per second, consuming all CPU and starving legitimate messages.",
    symptom:
      "CPU at 100%. Consumer processes the same bad message in a tight loop. Error rate is 100% (only that one message, endlessly reprocessed). Good messages pile up behind it, unprocessed.",
    goal:
      'Configure the consumer to nack with requeue=false on failure. Set up a DLX to route rejected messages to a dead-letter queue for manual inspection. Error rate below 5% and health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "The consumer nacks with requeue=true, putting the poison message back into the queue immediately. Change ackMode to 'manual' and configure errorRate to route failures to DLX instead of requeueing.",
        relatedConcept: 'nack-requeue',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Set deadLetterExchange on the 'validation' queue to route nacked messages to a DLX queue. With requeue=false, the poison message will be moved to the DLX and normal processing can resume.",
        relatedConcept: 'dead-letter-exchange',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 4096, minDiskFreeMb: 500, maxConnections: 1000 }],
    exchanges: [
      { name: 'data', type: 'direct', durable: true, autoDelete: false },
      { name: 'dlx', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'validation',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 50000,
        messageTtlMs: null,
        deadLetterExchange: null,  // BUG: no DLX configured
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
      {
        name: 'validation.dlq',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 10000,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
    ],
    bindings: [
      { exchange: 'data', queue: 'validation', routingKey: 'validate' },
      { exchange: 'dlx', queue: 'validation.dlq', routingKey: 'validation' },
    ],
    publishers: [
      {
        id: 'publisher-data',
        targetExchange: 'data',
        routingKey: 'validate',
        messagesPerSecond: 1000,
        messageSizeBytes: 1024,
        confirmMode: false,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-validator',
        queue: 'validation',
        prefetchCount: 10,
        ackMode: 'auto',  // BUG: auto-ack with high error rate = messages requeued in loop
        processingTimeMs: 1,
        errorRate: 0.9,   // 90% of messages "fail" — simulates poison message scenario
      },
    ],
  },

  failureScript: [
    // Inject a burst of bad messages at tick 5
    { atTick: 5, type: 'consumer-error-rate', target: 'consumer-validator', params: { errorRate: 0.99 } },
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
      concept: 'nack-requeue',
      title: 'Nack with Requeue=false',
      body: "When a consumer calls basic.nack or basic.reject with requeue=true, RabbitMQ returns the message to the queue immediately — potentially causing an infinite loop if the message is permanently invalid (a 'poison message'). Always nack with requeue=false for schema errors or unrecoverable failures. Pair this with a DLX to preserve the rejected message.",
      showWhenFixed: true,
    },
    {
      concept: 'poison-message',
      title: 'Poison Message Pattern',
      body: "A poison message is one that repeatedly causes consumer failures. Left unchecked, it blocks the entire queue. Defenses: (1) nack with requeue=false + DLX routing, (2) set x-delivery-count limit so messages are DLQ'd after N retries, (3) use a circuit breaker in the consumer to detect repeated failures on the same message ID.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-dead-letter-exchange',
    'set-ack-mode',
    'set-consumer-error-rate',
    'add-binding',
  ],
}

export default scenario
