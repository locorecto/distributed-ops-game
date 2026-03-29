import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-prefetch',
  index: 10,
  title: 'Prefetch Greedy Consumer',
  subtitle: 'Medium · Prefetch Count & Load Balancing',
  difficulty: 'medium',
  estimatedMinutes: 12,
  coverConcepts: ['prefetch-count', 'consumer-load-balancing', 'unacked-limit', 'qos'],

  briefing: {
    story:
      "ImageProcessor has 3 consumers on the 'images.resize' queue. One consumer is slow (cloud GPU spun down). With prefetch_count=0 (unlimited), that slow consumer greedily takes all 10,000 available messages into its unacked buffer. The other 2 fast consumers sit idle with nothing to process. The slow consumer then crashes, requeuing all 10,000 messages at once — causing a thundering herd.",
    symptom:
      "Consumer 'consumer-gpu-slow' has 10,000 unacked messages. Consumers 'consumer-gpu-1' and 'consumer-gpu-2' are idle (nothing in their prefetch window). When the slow consumer crashes, 10K messages are requeued simultaneously, overloading the other consumers.",
    goal:
      'Set prefetch_count=100 on all consumers. This limits each consumer to 100 in-flight messages and enables fair distribution. Total unacked messages should drop below 1,000 and health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "prefetch_count=0 means unlimited — a consumer can take ALL messages from the queue into its unacked buffer, starving other consumers. Set prefetch_count=100 on each consumer to cap in-flight messages.",
        relatedConcept: 'prefetch-count',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "With prefetch_count=100, RabbitMQ stops dispatching to a consumer once it has 100 unacked messages. The other consumers with free capacity will receive messages instead. This is RabbitMQ's built-in load balancing mechanism.",
        relatedConcept: 'consumer-load-balancing',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 8192, minDiskFreeMb: 500, maxConnections: 1000 }],
    exchanges: [
      { name: 'images', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'images.resize',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 200000,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
    ],
    bindings: [
      { exchange: 'images', queue: 'images.resize', routingKey: 'resize' },
    ],
    publishers: [
      {
        id: 'publisher-uploads',
        targetExchange: 'images',
        routingKey: 'resize',
        messagesPerSecond: 3000,
        messageSizeBytes: 2048,
        confirmMode: false,
        persistent: false,
      },
    ],
    consumers: [
      {
        id: 'consumer-gpu-1',
        queue: 'images.resize',
        prefetchCount: 0,  // BUG: unlimited prefetch
        ackMode: 'manual',
        processingTimeMs: 5,
        errorRate: 0,
      },
      {
        id: 'consumer-gpu-2',
        queue: 'images.resize',
        prefetchCount: 0,  // BUG: unlimited prefetch
        ackMode: 'manual',
        processingTimeMs: 5,
        errorRate: 0,
      },
      {
        id: 'consumer-gpu-slow',
        queue: 'images.resize',
        prefetchCount: 0,  // BUG: unlimited prefetch — takes everything
        ackMode: 'manual',
        processingTimeMs: 500,  // Very slow — simulates GPU spin-up latency
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    // Slow consumer crashes at tick 20, requeuing all its unacked messages
    { atTick: 20, type: 'consumer-crash', target: 'consumer-gpu-slow', params: {} },
  ],

  victoryConditions: [
    {
      id: 'unacked-low',
      description: 'Total unacked messages below 1,000',
      required: true,
      check: s => s.metrics.totalMessagesUnacked < 1000,
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
      concept: 'prefetch-count',
      title: 'Prefetch Count (QoS)',
      body: "basic.qos(prefetch_count=N) limits how many unacknowledged messages RabbitMQ will dispatch to a single consumer. With prefetch=0 (unlimited), one consumer can grab all messages, starving others. A good starting point is prefetch=N where N is roughly (consumer throughput per second × target processing latency). Too low = consumer starved waiting for acks. Too high = uneven load distribution.",
      showWhenFixed: true,
    },
    {
      concept: 'consumer-load-balancing',
      title: 'RabbitMQ Consumer Load Balancing',
      body: "RabbitMQ dispatches messages round-robin to consumers on the same queue. However, without a prefetch limit, a slow consumer accumulates a backlog of unacked messages while fast consumers sit idle. Prefetch count is the primary mechanism for fair load distribution — it converts push delivery into a pull-like model where consumers signal readiness by sending acks.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-prefetch-count',
    'restart-consumer',
    'add-consumer',
  ],
}

export default scenario
